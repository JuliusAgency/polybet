-- Managers Report: Profit = Deposits - Withdrawals (QA rejection fix, 2026-06-10).
--
-- 20260609132406 computed Profit as the HOUSE settlement P/L on the manager
-- group's positions. QA rejected the report as unverifiable: with Deposits
-- 500.00 and Withdrawals 800.00 it showed Profit -133.87, a number that cannot
-- be derived from the displayed columns. The product spec (polybet_docs.pdf,
-- "Net Profit Calculator" / "Total Profit Calc") defines the metric triple for
-- this report as:
--
--   Net Profit = Total Deposits - Total Withdrawals
--
-- which is also the formula get_agent_stats.monthly_pnl (migration 015) already
-- uses. This migration replaces the builder so Profit follows the spec formula;
-- positions/settlements no longer participate. Betting P/L per group remains
-- available via manager_group_metrics.group_pnl for screens that need it.
--
-- Deposits    = SUM of balance_transactions.amount where the MANAGER initiated
--               a deposit on one of their users (type='adjustment', positive).
-- Withdrawals = SUM of -amount where the MANAGER initiated a withdrawal
--               (type='transfer', stored negative -> reported as a positive
--               magnitude). Attribution is by initiated_by = manager.id.
-- Profit      = Deposits - Withdrawals (per manager, same period bounds).
--
-- Period params stay NULL-safe (NULL bound = unbounded). Same jsonb envelope
-- (rows + totals); totals.profit = totals.deposits - totals.withdrawals by
-- construction. The dispatcher admin_get_report_dataset is unchanged and keeps
-- its is_super_admin() gate.

CREATE OR REPLACE FUNCTION admin_build_managers_report_dataset(
  p_started_at timestamptz DEFAULT NULL,
  p_ended_at   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH dep_wd AS (
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
  rows AS (
    SELECT
      p.id                                AS manager_id,
      p.username                          AS manager_username,
      p.full_name                         AS manager_full_name,
      COALESCE(d.deposits, 0)::numeric    AS deposits,
      COALESCE(d.withdrawals, 0)::numeric AS withdrawals,
      (COALESCE(d.deposits, 0) - COALESCE(d.withdrawals, 0))::numeric AS profit
    FROM profiles p
    LEFT JOIN dep_wd d ON d.manager_id = p.id
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
  'Per-manager Deposits/Withdrawals (manager-initiated balance ops on their users) and Profit = Deposits - Withdrawals (spec: Net Profit Calculator) for a period. Used by the admin Managers Report (on-screen + PDF).';

-- SECURITY: CREATE OR REPLACE preserves the existing ACL, but re-assert the
-- revoke so the posture is self-documenting. The builder must be reachable ONLY
-- through the SECURITY DEFINER dispatcher (admin_get_report_dataset), which
-- enforces is_super_admin() in plpgsql. A `_guard` CTE would be dead code in a
-- LANGUAGE sql function (Postgres elides unreferenced CTEs), so the REVOKE is
-- the real gate against direct PostgREST calls.
REVOKE ALL ON FUNCTION admin_build_managers_report_dataset(timestamptz, timestamptz)
  FROM public, anon, authenticated;
