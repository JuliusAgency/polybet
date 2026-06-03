-- Migration: repoint the safety-net settle chain + exposure KPIs onto positions
--
-- After the cutover, open exposure and the settlement safety net must operate on
-- positions, not the frozen bets table (whose open rows are now stale). Function
-- signatures are unchanged so market-tracker (settlePendingBets /
-- reconcileStrandedBets) keeps calling them as-is.
--
-- Metric mapping (bets -> positions), preserving the original meaning:
--   stake            -> cost_basis        (USD locked in in_play)
--   potential_payout -> shares            ($1-per-share gross payout)
--   "settled profit" -> -realized_pnl     (house P/L = -(user realized P/L);
--                                           generalizes the old won/lost formula
--                                           AND now also captures sell spread).

-- ── settle_pending_bets: scan open POSITIONS on terminal markets ─────────────
CREATE OR REPLACE FUNCTION settle_pending_bets(
  p_max_markets int DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_market         record;
  v_total_settled  int := 0;
  v_total_winners  int := 0;
  v_markets_done   int := 0;
  v_result         jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  FOR v_market IN
    SELECT m.id, m.winning_outcome_id
    FROM markets m
    WHERE m.status IN ('closed', 'resolved', 'archived')
      AND m.winning_outcome_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM positions p
        WHERE p.market_id = m.id AND p.status = 'open'
      )
    LIMIT p_max_markets
  LOOP
    BEGIN
      v_result := settle_market(v_market.id, v_market.winning_outcome_id);
      v_total_settled := v_total_settled + COALESCE((v_result->>'settled')::int, 0);
      v_total_winners := v_total_winners + COALESCE((v_result->>'winners')::int, 0);
      v_markets_done := v_markets_done + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'settle_pending_bets: failed for market %: %', v_market.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'markets_processed', v_markets_done,
    'bets_settled', v_total_settled,
    'winners', v_total_winners
  );
END;
$$;

-- ── list_stranded_bets_unknown_winner: markets with open positions, no winner ─
CREATE OR REPLACE FUNCTION list_stranded_bets_unknown_winner(
  p_limit int DEFAULT 50
) RETURNS TABLE(
  market_id      uuid,
  polymarket_id  text,
  market_status  text,
  open_bet_count bigint
)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id            AS market_id,
    m.polymarket_id AS polymarket_id,
    m.status        AS market_status,
    (SELECT count(*) FROM positions p WHERE p.market_id = m.id AND p.status = 'open') AS open_bet_count
  FROM markets m
  WHERE m.status IN ('closed', 'resolved', 'archived')
    AND m.winning_outcome_id IS NULL
    AND m.polymarket_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM positions p
      WHERE p.market_id = m.id AND p.status = 'open'
    )
  ORDER BY m.id
  LIMIT p_limit;
$$;

-- ── v_stranded_open_bets: keep the column contract, source from positions ────
-- Column names (bet_id/stake/placed_at) are preserved so the super-admin
-- observability tile keeps working; bet_id now carries the position id,
-- stake the cost_basis, placed_at the opened_at.
CREATE OR REPLACE VIEW v_stranded_open_bets
WITH (security_invoker = on)
AS
  SELECT
    p.id              AS bet_id,
    p.user_id,
    p.market_id,
    p.cost_basis      AS stake,
    p.opened_at       AS placed_at,
    m.status          AS market_status,
    m.polymarket_id,
    m.winning_outcome_id,
    EXTRACT(epoch FROM (now() - GREATEST(m.resolved_at, m.archived_at, m.close_at, p.opened_at))) AS stranded_seconds
  FROM positions p
  JOIN markets m ON m.id = p.market_id
  WHERE p.status = 'open'
    AND m.status IN ('closed', 'resolved', 'archived');

-- ── system_kpis: open_exposure / system_profit / payouts on positions ────────
DROP VIEW IF EXISTS system_kpis;
CREATE VIEW system_kpis AS
SELECT
  COALESCE((
    SELECT SUM(b.available + b.in_play) FROM balances b
  ), 0)::numeric AS total_points_in_system,
  -- House liability on open positions: shares (gross payout) minus the cost
  -- basis already locked. Mirrors the old GREATEST(potential_payout-stake,0).
  COALESCE((
    SELECT SUM(GREATEST(p.shares - p.cost_basis, 0))
    FROM positions p
    WHERE p.status = 'open'
  ), 0)::numeric AS open_exposure,
  -- Settlement P/L for the house, preserving migration 036's identity
  -- total_stakes_collected - total_payouts_to_winners = system_profit. cost
  -- basis is zeroed at settle, so reconstruct it as shares*avg_price.
  -- (Early-exit/sell P/L is intentionally NOT folded in here so the identity
  -- holds; it is captured in positions.realized_pnl for a future dedicated KPI.)
  COALESCE((
    SELECT SUM(
      CASE
        WHEN p.status = 'won'  THEN p.shares * p.avg_price - p.shares
        WHEN p.status = 'lost' THEN p.shares * p.avg_price
        ELSE 0
      END
    )
    FROM positions p
    WHERE p.status IN ('won', 'lost')
  ), 0)::numeric AS system_profit,
  COALESCE((
    SELECT SUM(p.shares) FROM positions p WHERE p.status = 'won'
  ), 0)::numeric AS total_payouts_to_winners,
  -- Total cost basis collected over ALL settled positions (won + lost). Keeps
  -- the frontend `total_stakes_collected` contract (migration 036, read by
  -- useSystemKpis / AgentsDashboardPage / export-admin-report). cost basis was
  -- zeroed at settle → shares*avg_price.
  COALESCE((
    SELECT SUM(p.shares * p.avg_price) FROM positions p WHERE p.status IN ('won', 'lost')
  ), 0)::numeric AS total_stakes_collected,
  (SELECT COUNT(*) FROM markets WHERE status = 'open')::bigint     AS active_markets,
  (SELECT COUNT(*) FROM markets WHERE status = 'resolved')::bigint AS resolved_markets,
  (SELECT COUNT(*) FROM markets WHERE status = 'archived')::bigint AS archived_markets,
  (SELECT COUNT(*) FROM profiles WHERE role = 'manager')::bigint   AS total_managers,
  (SELECT COUNT(*) FROM profiles WHERE role = 'user')::bigint      AS total_users;

-- House-wide financials must not be readable by unauthenticated clients. (The
-- super-admin dashboard reads this as an authenticated user; service-role
-- report builders bypass grants.)
REVOKE SELECT ON system_kpis FROM anon;

-- ── admin_build_system_dashboard_dataset: exposure/profit on positions ───────
CREATE OR REPLACE FUNCTION admin_build_system_dashboard_dataset(
  p_started_at timestamptz DEFAULT NULL,
  p_ended_at   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH _guard AS (SELECT admin_require_super_admin())
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'total_system_points', COALESCE(
        (SELECT SUM(available + in_play) FROM balances), 0
      ),
      'open_exposure', COALESCE(
        (
          SELECT SUM(cost_basis) FROM positions
          WHERE status = 'open'
            AND (p_started_at IS NULL OR opened_at >= p_started_at)
            AND (p_ended_at   IS NULL OR opened_at <= p_ended_at)
        ), 0
      ),
      'system_profit', COALESCE(
        (
          SELECT SUM(
            CASE
              WHEN status = 'won'  THEN shares * avg_price - shares
              WHEN status = 'lost' THEN shares * avg_price
              ELSE 0
            END
          )
          FROM positions
          WHERE settled_at IS NOT NULL
            AND (p_started_at IS NULL OR settled_at >= p_started_at)
            AND (p_ended_at   IS NULL OR settled_at <= p_ended_at)
        ), 0
      )
    ),
    'counts', jsonb_build_object(
      'users',    (SELECT COUNT(*) FROM profiles WHERE role = 'user'),
      'managers', (SELECT COUNT(*) FROM profiles WHERE role = 'manager'),
      'markets',  (SELECT COUNT(*) FROM markets)
    )
  );
$$;

-- Super-admin-only report builder (the in-function admin_require_super_admin()
-- guard enforces it). Only the SECURITY DEFINER dispatcher admin_get_report_dataset
-- calls it (as postgres), so revoke the default PUBLIC + anon execute entirely.
REVOKE ALL ON FUNCTION admin_build_system_dashboard_dataset(timestamptz, timestamptz) FROM public, anon;
