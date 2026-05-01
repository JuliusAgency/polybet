-- Migration 071: consolidate the bet-settlement chain so stranded open bets
-- can no longer accumulate silently across sync paths.
--
-- Background — known fragility points before this migration:
--   1. bulk_upsert_markets writes markets.status='resolved' from Gamma but
--      never populates winning_outcome_id — the field that settle_pending_bets
--      requires to actually pay out bets. So a freshly-synced resolved market
--      is invisible to the safety net until some other path (resolutionScan
--      registry hit, WebSocket detector, frontend refresh-markets) happens
--      to rediscover it. Markets that drop out of Gamma's recent-resolved
--      window before any of those fire end up with bets stuck on 'open'
--      forever.
--   2. settle_pending_bets only scans status IN ('resolved','archived'). A
--      market in 'closed' state — which is what closeExpiredMarkets and many
--      Polymarket events look like in the gap between trading-end and
--      resolution-publish — is invisible to the safety net regardless of
--      whether a winner is known.
--
-- This migration:
--   1. Adds settle_market_by_token: a thin lookup wrapper so the sync path
--      can settle by Polymarket token id without round-tripping through TS
--      to look up the internal outcome uuid. Used by the new batchWriter
--      step that fires after bulk_upsert_outcomes.
--   2. Widens settle_pending_bets to also scan 'closed' markets — paired
--      with (1), this means: as soon as bulk_upsert_markets sees a resolved
--      Polymarket payload, the winner gets persisted, and the next safety-
--      net tick settles every stranded bet on it. No registry hit required.
--   3. Adds list_stranded_bets_unknown_winner: returns markets in any
--      terminal-ish state (closed/resolved/archived) that still have open
--      bets but no winning_outcome_id. Caller (market-tracker's new
--      reconcileStrandedBets tick) fetches Gamma directly to find the winner
--      and calls settle_market_by_token. Closes the gap for markets that
--      our DB has as 'closed' but Polymarket has already resolved upstream.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. settle_market_by_token: lookup-then-settle convenience wrapper.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION settle_market_by_token(
  p_market_id                    uuid,
  p_winning_polymarket_token_id  text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_outcome_id uuid;
BEGIN
  -- Service role (auth.uid IS NULL) or super_admin only.
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
      RAISE EXCEPTION 'Permission denied: only super_admin can settle markets';
    END IF;
  END IF;

  IF p_winning_polymarket_token_id IS NULL OR p_winning_polymarket_token_id = '' THEN
    RETURN jsonb_build_object('error', 'missing_token_id', 'market_id', p_market_id);
  END IF;

  SELECT id INTO v_outcome_id
  FROM market_outcomes
  WHERE market_id = p_market_id
    AND polymarket_token_id = p_winning_polymarket_token_id;

  IF v_outcome_id IS NULL THEN
    -- The token id from Gamma does not match any of our outcomes. This
    -- should not happen if outcomes were upserted before settlement, but
    -- when it does we surface it to the caller rather than silently
    -- skipping — the safety net relies on visible failure to retry.
    RETURN jsonb_build_object(
      'error', 'outcome_not_found',
      'market_id', p_market_id,
      'token_id', p_winning_polymarket_token_id
    );
  END IF;

  RETURN settle_market(p_market_id, v_outcome_id);
END;
$$;

REVOKE ALL ON FUNCTION settle_market_by_token(uuid, text) FROM public;
REVOKE ALL ON FUNCTION settle_market_by_token(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION settle_market_by_token(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION settle_market_by_token(uuid, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. settle_pending_bets: widen scan to include 'closed' so the safety net
--    catches markets where status was flipped without going through
--    settle_market.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION settle_pending_bets(
  p_max_markets int DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  -- Now scans 'closed' too. settle_market is idempotent on bets and will
  -- promote 'closed' → 'resolved' as part of the call (see migration 067),
  -- so the only requirement on our side is a known winner.
  FOR v_market IN
    SELECT m.id, m.winning_outcome_id
    FROM markets m
    WHERE m.status IN ('closed', 'resolved', 'archived')
      AND m.winning_outcome_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM bets b
        WHERE b.market_id = m.id AND b.status = 'open'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. list_stranded_bets_unknown_winner: surface markets where bets are open
--    but our DB has no winner recorded. Caller resolves the winner via Gamma
--    and pipes it back through settle_market_by_token.
-- ─────────────────────────────────────────────────────────────────────────────
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
    (SELECT count(*) FROM bets b WHERE b.market_id = m.id AND b.status = 'open') AS open_bet_count
  FROM markets m
  WHERE m.status IN ('closed', 'resolved', 'archived')
    AND m.winning_outcome_id IS NULL
    AND m.polymarket_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM bets b
      WHERE b.market_id = m.id AND b.status = 'open'
    )
  ORDER BY m.id
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION list_stranded_bets_unknown_winner(int) FROM public;
REVOKE ALL ON FUNCTION list_stranded_bets_unknown_winner(int) FROM anon;
REVOKE ALL ON FUNCTION list_stranded_bets_unknown_winner(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION list_stranded_bets_unknown_winner(int) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. v_stranded_open_bets: super-admin observability view. Lists every open
--    bet whose market has been in a terminal-ish state for more than the
--    visible-stranding threshold. Powers the TestLab "stranded bets" tile.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_stranded_open_bets
WITH (security_invoker = on)
AS
  SELECT
    b.id              AS bet_id,
    b.user_id,
    b.market_id,
    b.stake,
    b.placed_at,
    m.status          AS market_status,
    m.polymarket_id,
    m.winning_outcome_id,
    EXTRACT(epoch FROM (now() - GREATEST(m.resolved_at, m.archived_at, m.close_at, b.placed_at))) AS stranded_seconds
  FROM bets b
  JOIN markets m ON m.id = b.market_id
  WHERE b.status = 'open'
    AND m.status IN ('closed', 'resolved', 'archived');

GRANT SELECT ON v_stranded_open_bets TO authenticated;
