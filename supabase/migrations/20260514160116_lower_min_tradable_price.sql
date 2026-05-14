-- Migration: lower min tradable price to 0.001 for Polymarket parity
--
-- Background: previous place_bet (20260514091027) enforced c_min_price = 0.01,
-- which mirrored the priceToOdds floor in both sync runtimes. The product
-- intent however is to allow betting on sub-cent outcomes (e.g. Yes at 0.5%
-- on a long-tail market), exactly like Polymarket does. Frontend gate has been
-- lowered in src/entities/market/tradability.ts; the RPC must follow or the
-- UI fix is cosmetic.
--
-- Changes vs prior version:
--   * c_min_price: 0.01 -> 0.001
--   * c_max_odds:  110  -> 1010 (new theoretical max odds = 1/0.001 = 1000,
--                                 +10 headroom for house-margin variants)
--
-- All other guards stay identical: ceiling 0.99, market+outcome freshness
-- 3 minutes, 2% expected-odds drift tolerance, close_at NOT NULL & > now(),
-- market open & visible, balance lock, bet-limit hierarchy.
--
-- No cleanup block: prior migration already voided legacy stale-odds bets;
-- no new defect class is introduced by raising the cap (sync runtimes are
-- floored at 0.001 by a co-shipped change, so legitimate odds never exceed
-- ~1000; staleness guard rejects rows older than 3 minutes regardless).

CREATE OR REPLACE FUNCTION place_bet(
  p_market_id      uuid,
  p_outcome_id     uuid,
  p_stake          numeric,
  p_expected_odds  numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  c_min_price            CONSTANT numeric  := 0.001;
  c_max_price            CONSTANT numeric  := 0.99;
  c_max_odds             CONSTANT numeric  := 1010;
  c_max_staleness        CONSTANT interval := interval '3 minutes';
  c_odds_drift_tolerance CONSTANT numeric  := 0.02;

  v_user_id         uuid := auth.uid();
  v_available       numeric;
  v_effective_odds  numeric;
  v_price           numeric;
  v_outcome_updated timestamptz;
  v_market_synced   timestamptz;
  v_market_created  timestamptz;
  v_payout          numeric;
  v_bet_id          uuid;
  v_balance_after   numeric;
  v_limit           numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT effective_limit
  INTO v_limit
  FROM resolve_effective_max_bet_limit(v_user_id);

  IF v_limit IS NOT NULL AND p_stake > v_limit THEN
    RAISE EXCEPTION 'Stake exceeds effective maximum bet limit';
  END IF;

  SELECT last_synced_at, created_at
  INTO v_market_synced, v_market_created
  FROM markets
  WHERE id = p_market_id
    AND status = 'open'
    AND is_visible = true
    AND close_at IS NOT NULL
    AND close_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market is not available for betting';
  END IF;

  IF v_market_synced IS NULL THEN
    IF v_market_created IS NULL OR v_market_created < now() - c_max_staleness THEN
      RAISE EXCEPTION 'Market price feed is stale';
    END IF;
  ELSIF v_market_synced < now() - c_max_staleness THEN
    RAISE EXCEPTION 'Market price feed is stale';
  END IF;

  SELECT effective_odds, price, updated_at
  INTO v_effective_odds, v_price, v_outcome_updated
  FROM market_outcomes
  WHERE id = p_outcome_id AND market_id = p_market_id;

  IF v_effective_odds IS NULL THEN
    RAISE EXCEPTION 'Invalid outcome for this market';
  END IF;

  -- Floor protects against true-zero / negative prices only. Sub-cent prices
  -- (e.g. 0.005 -> 0.5¢) are legitimate to bet on, matching Polymarket.
  IF v_price IS NULL OR v_price < c_min_price THEN
    RAISE EXCEPTION 'Outcome is untradable (price at floor)';
  END IF;

  IF v_price >= c_max_price THEN
    RAISE EXCEPTION 'Outcome is untradable (price at ceiling)';
  END IF;

  IF v_effective_odds > c_max_odds THEN
    RAISE EXCEPTION 'Outcome odds out of bounds';
  END IF;

  IF v_outcome_updated IS NULL OR v_outcome_updated < now() - c_max_staleness THEN
    RAISE EXCEPTION 'Outcome price feed is stale';
  END IF;

  IF p_expected_odds IS NOT NULL THEN
    IF abs(p_expected_odds - v_effective_odds) / v_effective_odds > c_odds_drift_tolerance THEN
      RAISE EXCEPTION 'Odds changed (expected %, actual %)',
        p_expected_odds, v_effective_odds
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT available INTO v_available
  FROM balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_available IS NULL OR v_available < p_stake THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  v_payout        := p_stake * v_effective_odds;
  v_balance_after := v_available - p_stake;

  INSERT INTO bets (user_id, market_id, outcome_id, stake, locked_odds, potential_payout)
  VALUES (v_user_id, p_market_id, p_outcome_id, p_stake, v_effective_odds, v_payout)
  RETURNING id INTO v_bet_id;

  UPDATE balances
  SET available  = available - p_stake,
      in_play    = in_play + p_stake,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO balance_transactions
    (user_id, initiated_by, type, amount, balance_after, bet_id, note)
  VALUES
    (v_user_id, v_user_id, 'bet_lock', -p_stake, v_balance_after, v_bet_id, 'Bet placed');

  RETURN v_bet_id;
END;
$$;
