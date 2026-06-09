-- Managers Report dataset: per-manager Deposits / Withdrawals / Profit for a
-- period, surfaced on the admin Reports screen (on-screen table + PDF export).
--
-- Definitions (confirmed with product):
--   Deposits    = SUM of balance_transactions.amount where the MANAGER initiated
--                 a deposit on one of their users (type='adjustment', positive).
--   Withdrawals = SUM of -amount where the MANAGER initiated a withdrawal
--                 (type='transfer', stored negative -> reported as a positive
--                 magnitude). Attribution is by initiated_by = manager.id.
--   Profit      = HOUSE settlement P/L on the manager's group positions SETTLED
--                 in the period, same sign convention as
--                 manager_group_metrics.group_pnl (won: shares*avg_price-shares,
--                 lost: shares*avg_price), but bounded by positions.settled_at.
--
-- Period params are NULL-safe (NULL bound = unbounded, mirroring the other
-- admin_build_*_dataset functions). One row per manager (profiles.role='manager')
-- plus a totals object. Registered in the admin_get_report_dataset dispatcher.

CREATE OR REPLACE FUNCTION admin_build_managers_report_dataset(
  p_started_at timestamptz DEFAULT NULL,
  p_ended_at   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH _guard AS (SELECT admin_require_super_admin()),
  dep_wd AS (
    SELECT
      bt.initiated_by                                        AS manager_id,
      COALESCE(SUM(bt.amount)  FILTER (WHERE bt.type = 'adjustment'), 0) AS deposits,
      COALESCE(SUM(-bt.amount) FILTER (WHERE bt.type = 'transfer'),   0) AS withdrawals
    FROM balance_transactions bt
    WHERE bt.type IN ('adjustment', 'transfer')
      AND (p_started_at IS NULL OR bt.created_at >= p_started_at)
      AND (p_ended_at   IS NULL OR bt.created_at <= p_ended_at)
    GROUP BY bt.initiated_by
  ),
  profit AS (
    SELECT
      mul.manager_id,
      COALESCE(SUM(CASE
        WHEN pos.status = 'won'  THEN pos.shares * pos.avg_price - pos.shares
        WHEN pos.status = 'lost' THEN pos.shares * pos.avg_price
        ELSE 0
      END), 0) AS profit
    FROM positions pos
    JOIN manager_user_links mul ON mul.user_id = pos.user_id
    WHERE pos.status IN ('won', 'lost')
      AND (p_started_at IS NULL OR pos.settled_at >= p_started_at)
      AND (p_ended_at   IS NULL OR pos.settled_at <= p_ended_at)
    GROUP BY mul.manager_id
  ),
  rows AS (
    SELECT
      p.id                                AS manager_id,
      p.username                          AS manager_username,
      p.full_name                         AS manager_full_name,
      COALESCE(d.deposits, 0)::numeric    AS deposits,
      COALESCE(d.withdrawals, 0)::numeric AS withdrawals,
      COALESCE(pr.profit, 0)::numeric     AS profit
    FROM profiles p
    LEFT JOIN dep_wd d  ON d.manager_id = p.id
    LEFT JOIN profit pr ON pr.manager_id = p.id
    WHERE p.role = 'manager'
    ORDER BY p.username
  )
  SELECT jsonb_build_object(
    'rows', COALESCE(jsonb_agg(to_jsonb(rows)), '[]'::jsonb),
    'totals', jsonb_build_object(
      'deposits',    COALESCE(SUM(rows.deposits), 0),
      'withdrawals', COALESCE(SUM(rows.withdrawals), 0),
      'profit',      COALESCE(SUM(rows.profit), 0)
    )
  )
  FROM rows;
$$;

COMMENT ON FUNCTION admin_build_managers_report_dataset(timestamptz, timestamptz) IS
  'Per-manager Deposits/Withdrawals (manager-initiated balance ops on their users) and house Profit (group settlement P/L bounded by settled_at) for a period. Used by the admin Managers Report (on-screen + PDF).';

-- SECURITY: the builder must be reachable ONLY through the SECURITY DEFINER
-- dispatcher (admin_get_report_dataset), which enforces is_super_admin() in
-- plpgsql. The `WITH _guard AS (SELECT admin_require_super_admin())` CTE above is
-- NOT a reliable gate on its own: Postgres elides an unreferenced CTE in a
-- LANGUAGE sql function, so the guard call never runs when the builder is invoked
-- directly. We therefore REVOKE EXECUTE from every app role (public, anon AND
-- authenticated) so no client JWT can call the builder via PostgREST and read all
-- managers' financials. The dispatcher still reaches it because SECURITY DEFINER
-- executes as the function owner, which keeps EXECUTE. (The sibling builders in
-- 031/032 only revoke public/anon and rely on the same dead CTE — they retain a
-- latent direct-call path for the authenticated role; out of scope to fix here.)
REVOKE ALL ON FUNCTION admin_build_managers_report_dataset(timestamptz, timestamptz)
  FROM public, anon, authenticated;

-- Re-create the dispatcher to register the new report type. Identical to
-- migration 032 plus the 'managers_report' branch.
CREATE OR REPLACE FUNCTION admin_get_report_dataset(
  p_report_type text,
  p_started_at  timestamptz DEFAULT NULL,
  p_ended_at    timestamptz DEFAULT NULL,
  p_manager_id  uuid        DEFAULT NULL,
  p_user_id     uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dataset jsonb := '{}'::jsonb;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  IF p_started_at IS NOT NULL
     AND p_ended_at IS NOT NULL
     AND p_started_at > p_ended_at THEN
    RAISE EXCEPTION 'Invalid report range: started_at must be before ended_at';
  END IF;

  CASE p_report_type
    WHEN 'managers_log' THEN
      v_dataset := admin_build_managers_log_dataset(p_started_at, p_ended_at);
    WHEN 'bets_log' THEN
      v_dataset := admin_build_bets_log_dataset(p_started_at, p_ended_at);
    WHEN 'system_dashboard' THEN
      v_dataset := admin_build_system_dashboard_dataset(p_started_at, p_ended_at);
    WHEN 'managers_report' THEN
      v_dataset := admin_build_managers_report_dataset(p_started_at, p_ended_at);
    ELSE
      RAISE EXCEPTION 'Unsupported report_type: %', p_report_type;
  END CASE;

  RETURN jsonb_build_object(
    'report_type',  p_report_type,
    'generated_at', now(),
    'filters',      jsonb_build_object(
      'started_at', p_started_at,
      'ended_at',   p_ended_at
    ),
    'data', v_dataset
  );
END;
$$;

-- NOTE on grants: admin_get_report_dataset is intentionally callable by the
-- `authenticated` role — it is the entry point for both the export edge function
-- and the on-screen managers report (useManagersReport calls it via supabase.rpc
-- as the logged-in super_admin). Its internal `IF NOT is_super_admin()` guard is
-- the access control; revoking EXECUTE here would break those legitimate callers.
-- The underlying builder functions, by contrast, ARE revoked from public/anon
-- because only this SECURITY DEFINER dispatcher (running as owner) needs them.
