-- Migration 067: settlement is idempotent on bets, not on market status,
-- plus a DB-level safety net (settle_pending_bets) that reconciles any bets
-- left open on resolved markets.
--
-- Background — silent failure mode previously possible:
--   1. market-tracker's lifecycleCrawl/eventCrawl pulls a closed event from
--      Polymarket Gamma where gm.resolved=true.
--   2. bulk_upsert_markets writes markets.status='resolved' directly, but
--      does NOT call settle_market (it's a pure upsert).
--   3. The previous settle_market exited early on markets.status='resolved'
--      with {settled: 0, already_settled: true} — so any later settlement
--      attempt (resolutionScan, refresh-markets edge function, WS event) was
--      a no-op.
--   4. Bets stayed status='open' forever, balances were never paid out.
--
-- Independently, market-tracker's in-memory registry caches market.status
-- from the DB at bootstrap time, and resolutionScan early-exits on
-- registry status='resolved'. After a service restart this means the
-- service can never settle bets that were stranded as in (3).
--
-- Fix:
--   1. settle_market is now idempotent on bets, not on the market's status.
--      It accepts already-resolved markets and processes any remaining open
--      bets, as long as the supplied winning_outcome_id matches the one
--      already stored (or the stored one is NULL, in which case it gets
--      patched in).
--   2. settle_pending_bets() is a new RPC: a periodic safety-net that finds
--      every (markets.status='resolved' AND winning_outcome_id IS NOT NULL)
--      with at least one open bet, and settles them. Runs independently of
--      the in-memory registry so service restarts don't strand bets.

CREATE OR REPLACE FUNCTION settle_market(
  p_market_id          uuid,
  p_winning_outcome_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bet                record;
  v_payout             numeric;
  v_balance_after      numeric;
  v_settled_count      int     := 0;
  v_winner_count       int     := 0;
  v_settlement_log_id  uuid    := null;
  v_market             record;
BEGIN
  -- Allow service role (uid is NULL) or super_admin only
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
      RAISE EXCEPTION 'Permission denied: only super_admin can settle markets';
    END IF;
  END IF;

  -- Lock market row to serialize concurrent settlement attempts
  SELECT id, status, winning_outcome_id
  INTO v_market
  FROM markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF v_market.id IS NULL THEN
    RAISE EXCEPTION 'Market does not exist';
  END IF;

  -- Reject conflicting winners on already-resolved markets — this would mean
  -- the upstream resolver gave us a different answer than what we recorded,
  -- which is a data-integrity issue, not an idempotency case.
  IF v_market.winning_outcome_id IS NOT NULL
     AND v_market.winning_outcome_id <> p_winning_outcome_id THEN
    RAISE EXCEPTION 'Market already resolved with a different winning_outcome_id';
  END IF;

  -- Bring the market into a fully-resolved state if it isn't there already.
  -- Three legitimate states we may encounter:
  --   a) status != ('resolved','archived') AND winning_outcome_id IS NULL
  --      → first-time settlement, flip everything.
  --   b) status IN ('resolved','archived') AND winning_outcome_id IS NULL
  --      → bulk_upsert_markets flipped the status without setting the winner;
  --        patch the winner in.
  --   c) status IN ('resolved','archived') AND winning_outcome_id matches
  --      → idempotent re-entry, just process any remaining open bets.
  IF v_market.status NOT IN ('resolved', 'archived') THEN
    UPDATE markets
    SET status             = 'resolved',
        winning_outcome_id = p_winning_outcome_id,
        resolved_at        = now()
    WHERE id = p_market_id;
  ELSIF v_market.winning_outcome_id IS NULL THEN
    UPDATE markets
    SET winning_outcome_id = p_winning_outcome_id,
        resolved_at        = COALESCE(resolved_at, now())
    WHERE id = p_market_id;
  END IF;

  -- Process any open bets on this market. With idempotent semantics this
  -- loop runs zero times on a re-entry whose bets are already settled.
  FOR v_bet IN
    SELECT b.*
    FROM bets b
    WHERE b.market_id = p_market_id AND b.status = 'open'
    FOR UPDATE OF b
  LOOP
    v_settled_count := v_settled_count + 1;

    IF v_bet.outcome_id = p_winning_outcome_id THEN
      v_payout       := v_bet.stake * v_bet.locked_odds;
      v_winner_count := v_winner_count + 1;

      UPDATE balances
      SET available  = available + v_payout,
          in_play    = in_play - v_bet.stake,
          updated_at = now()
      WHERE user_id = v_bet.user_id;

      SELECT available INTO v_balance_after FROM balances WHERE user_id = v_bet.user_id;

      INSERT INTO balance_transactions
        (user_id, initiated_by, type, amount, balance_after, bet_id, note)
      VALUES
        (v_bet.user_id, v_bet.user_id, 'bet_payout', v_payout, v_balance_after, v_bet.id, 'Bet won')
      ON CONFLICT DO NOTHING;

      UPDATE bets SET status = 'won', settled_at = now() WHERE id = v_bet.id;
    ELSE
      UPDATE balances
      SET in_play    = in_play - v_bet.stake,
          updated_at = now()
      WHERE user_id = v_bet.user_id;

      SELECT available INTO v_balance_after FROM balances WHERE user_id = v_bet.user_id;

      INSERT INTO balance_transactions
        (user_id, initiated_by, type, amount, balance_after, bet_id, note)
      VALUES
        (v_bet.user_id, v_bet.user_id, 'bet_payout', 0, v_balance_after, v_bet.id, 'Bet lost')
      ON CONFLICT DO NOTHING;

      UPDATE bets SET status = 'lost', settled_at = now() WHERE id = v_bet.id;
    END IF;
  END LOOP;

  IF v_settled_count > 0 THEN
    INSERT INTO market_settlement_logs
      (market_id, winning_outcome_id, settled_count, winner_count, loser_count, triggered_by)
    VALUES
      (p_market_id, p_winning_outcome_id, v_settled_count, v_winner_count, v_settled_count - v_winner_count, auth.uid())
    RETURNING id INTO v_settlement_log_id;

    INSERT INTO bet_settlement_logs
      (market_settlement_id, bet_id, user_id, outcome, stake, payout)
    SELECT
      v_settlement_log_id,
      b.id,
      b.user_id,
      b.status,
      b.stake,
      CASE WHEN b.status = 'won' THEN b.stake * b.locked_odds ELSE 0 END
    FROM bets b
    WHERE b.market_id = p_market_id
      AND b.status IN ('won', 'lost')
      AND b.settled_at >= now() - interval '5 seconds'
    ON CONFLICT (bet_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'settled', v_settled_count,
    'winners', v_winner_count,
    'losers',  v_settled_count - v_winner_count,
    'already_settled', (v_settled_count = 0),
    'settlement_log_id', v_settlement_log_id
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- settle_pending_bets: DB-level reconciler. Finds resolved markets that
-- still have open bets and settles them. Safe to call repeatedly; bounded
-- by p_max_markets so a single tick never blocks a transaction long enough
-- to matter.
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

  FOR v_market IN
    SELECT m.id, m.winning_outcome_id
    FROM markets m
    WHERE m.status IN ('resolved', 'archived')
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
