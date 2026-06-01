-- Migration C: settle_market pays out shares
--
-- Shares model: a winning bet pays `shares` dollars (each share = $1), not
-- `stake * locked_odds`. After migration A's backfill every row has `shares`
-- populated, so the COALESCE first arm always wins; the chain is a belt-and-
-- braces fallback for any legacy / NULL row (shares -> potential_payout ->
-- stake*locked_odds, all three are equal by construction).
--
-- This is the ONLY behavioural change vs migration 067. Everything else
-- (permissions, market lock, conflicting-winner reject, status-flip branches
-- a/b/c, losing branch, idempotency via status='open' loop + ON CONFLICT DO
-- NOTHING, settlement logs) is preserved verbatim. settle_pending_bets is
-- unchanged and not redefined here.

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
      -- Shares model: each winning share pays $1. shares is authoritative;
      -- the COALESCE chain protects legacy/NULL rows.
      v_payout       := COALESCE(v_bet.shares, v_bet.potential_payout, v_bet.stake * v_bet.locked_odds);
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
      CASE WHEN b.status = 'won'
           THEN COALESCE(b.shares, b.potential_payout, b.stake * b.locked_odds)
           ELSE 0 END
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

COMMENT ON FUNCTION settle_market(uuid, uuid) IS
  'Idempotent on bets (not market status). Shares model: a winning bet pays `shares` dollars (each share = $1) via COALESCE(shares, potential_payout, stake*locked_odds). Accepts already-resolved markets and settles remaining open bets as long as the supplied winning_outcome_id matches the stored one (or stored is NULL).';
