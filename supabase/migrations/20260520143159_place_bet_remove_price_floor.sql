-- Migration: place_bet — remove arbitrary price floor / ceiling
--
-- Background: 20260514160116_lower_min_tradable_price lowered c_min_price
-- from 0.01 to 0.001 (and matching c_max_price 0.99 -> 0.999). QA report
-- 2026-05-20 surfaced that Polymarket itself keeps both sides of every
-- non-resolved outcome clickable across the full (0, 1) band — long-tail
-- candidates displayed as "0.1¢" or "100.0¢" are tradable there even when
-- the mid/last price is technically sub-cent.
--
-- Polybet UI used isOutcomeTradable(price) with floor 0.001 + ceiling < 1
-- to dim the buttons; this RPC mirrored that. Result: users saw "Buy Yes
-- 0.1¢" on Polybet but the button was dead because price in DB was
-- sub-tenth-cent (e.g. 0.0005). Server would have refused anyway with
-- "Outcome is untradable (price at floor)".
--
-- This migration:
--   * c_min_price: 0.001 -> 0   (only the degenerate exact-zero is rejected)
--   * c_max_price: 0.999 -> 1   (only the degenerate exact-one is rejected)
--   * The two RAISE EXCEPTION blocks collapse to a single out-of-range check
--     that fires only for the truly unbettable degenerate values.
--
-- What stays the same (the real antifraud guarantees):
--   * 3-min outcome price staleness check (c_max_staleness)
--   * 5-second book staleness check       (c_book_max_staleness)
--   * 2% odds drift tolerance              (c_odds_drift_tolerance)
--   * book partial-fill rejection          (Insufficient liquidity)
--   * c_max_odds 1000 cap                  (defensive against absurd payouts)
--   * indicative-odds fallback when book row is missing entirely
--
-- The book quote (quote_bet_payout) is the single source of truth for
-- whether the stake actually fills. If the book is empty, partial fill is
-- still rejected — no economic regression.

CREATE OR REPLACE FUNCTION place_bet(
  p_market_id      uuid,
  p_outcome_id     uuid,
  p_stake          numeric,
  p_expected_odds  numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  -- No UI/server price floor: the book quote decides fillability, and the
  -- partial-fill check below rejects the cases where the legacy floor
  -- would have. Only the degenerate exact-0 / exact-1 are still refused
  -- since there is literally nothing to buy/lose at those prices.
  c_min_price            CONSTANT numeric  := 0;
  c_max_price            CONSTANT numeric  := 1;
  c_max_odds             CONSTANT numeric  := 1000;
  c_max_staleness        CONSTANT interval := interval '3 minutes';
  c_book_max_staleness   CONSTANT interval := interval '5 seconds';
  c_odds_drift_tolerance CONSTANT numeric  := 0.02;

  v_user_id         uuid := auth.uid();
  v_available       numeric;
  v_token_id        text;
  v_indicative_odds numeric;
  v_price           numeric;
  v_outcome_updated timestamptz;
  v_market_synced   timestamptz;
  v_market_created  timestamptz;
  v_payout          numeric;
  v_locked_odds     numeric;
  v_bet_id          uuid;
  v_balance_after   numeric;
  v_limit           numeric;

  v_quote_shares      numeric;
  v_quote_eff_odds    numeric;
  v_quote_partial     boolean;
  v_quote_book_at     timestamptz;
  v_using_book        boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_stake IS NULL OR p_stake <= 0 THEN
    RAISE EXCEPTION 'Stake must be positive';
  END IF;

  -- Effective max bet limit hierarchy (global > manager > user)
  SELECT effective_limit
  INTO v_limit
  FROM resolve_effective_max_bet_limit(v_user_id);

  IF v_limit IS NOT NULL AND p_stake > v_limit THEN
    RAISE EXCEPTION 'Stake exceeds effective maximum bet limit';
  END IF;

  -- Lock the market row to serialize concurrent bets on the same market.
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

  -- Market price feed freshness (indicative).
  IF v_market_synced IS NULL THEN
    IF v_market_created IS NULL OR v_market_created < now() - c_max_staleness THEN
      RAISE EXCEPTION 'Market price feed is stale';
    END IF;
  ELSIF v_market_synced < now() - c_max_staleness THEN
    RAISE EXCEPTION 'Market price feed is stale';
  END IF;

  -- Outcome read & validate.
  SELECT polymarket_token_id, effective_odds, price, updated_at
  INTO v_token_id, v_indicative_odds, v_price, v_outcome_updated
  FROM market_outcomes
  WHERE id = p_outcome_id AND market_id = p_market_id;

  IF v_indicative_odds IS NULL THEN
    RAISE EXCEPTION 'Invalid outcome for this market';
  END IF;

  IF v_token_id IS NULL THEN
    RAISE EXCEPTION 'Outcome is not tradable (no Polymarket token)';
  END IF;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Outcome price feed unavailable';
  END IF;

  -- Polymarket parity: only the degenerate exact-0 / exact-1 are refused.
  -- Everything between is delegated to the book partial-fill guard below.
  IF v_price <= c_min_price OR v_price >= c_max_price THEN
    RAISE EXCEPTION 'Outcome is out of tradable range';
  END IF;

  IF v_indicative_odds > c_max_odds THEN
    RAISE EXCEPTION 'Outcome odds out of bounds';
  END IF;

  IF v_outcome_updated IS NULL OR v_outcome_updated < now() - c_max_staleness THEN
    RAISE EXCEPTION 'Outcome price feed is stale';
  END IF;

  -- Book quote: try to use book-derived payout, fall back to indicative when
  -- the book is genuinely missing for this outcome.
  SELECT shares, effective_odds, partial, book_updated_at
  INTO v_quote_shares, v_quote_eff_odds, v_quote_partial, v_quote_book_at
  FROM quote_bet_payout(v_token_id, p_stake);

  IF v_quote_book_at IS NULL THEN
    -- No book row at all → fallback to indicative odds. This is the rollout
    -- window for market-tracker; the legacy formula is the safe default and
    -- matches the pre-book behaviour users were already used to.
    v_using_book   := false;
    v_locked_odds  := v_indicative_odds;
    v_payout       := p_stake * v_indicative_odds;
  ELSE
    -- Book row present: enforce freshness and depth.
    IF v_quote_book_at < now() - c_book_max_staleness THEN
      RAISE EXCEPTION 'Market book is stale';
    END IF;

    IF v_quote_partial OR v_quote_shares <= 0 THEN
      RAISE EXCEPTION 'Insufficient liquidity for this stake';
    END IF;

    IF v_quote_eff_odds > c_max_odds THEN
      RAISE EXCEPTION 'Outcome odds out of bounds';
    END IF;

    v_using_book  := true;
    v_locked_odds := v_quote_eff_odds;
    v_payout      := v_quote_shares;
  END IF;

  -- Drift-guard: client sent its observed odds. Compare against whatever
  -- odds value actually drives the payout this time (book or indicative).
  IF p_expected_odds IS NOT NULL THEN
    IF v_locked_odds > 0
       AND abs(p_expected_odds - v_locked_odds) / v_locked_odds > c_odds_drift_tolerance
    THEN
      RAISE EXCEPTION 'Odds changed (expected %, actual %)',
        p_expected_odds, v_locked_odds
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Lock balance row to prevent double-spend.
  SELECT available INTO v_available
  FROM balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_available IS NULL OR v_available < p_stake THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  v_balance_after := v_available - p_stake;

  INSERT INTO bets (user_id, market_id, outcome_id, stake, locked_odds, potential_payout)
  VALUES (v_user_id, p_market_id, p_outcome_id, p_stake, v_locked_odds, v_payout)
  RETURNING id INTO v_bet_id;

  UPDATE balances
  SET available  = available - p_stake,
      in_play    = in_play + p_stake,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO balance_transactions
    (user_id, initiated_by, type, amount, balance_after, bet_id, note)
  VALUES
    (v_user_id, v_user_id, 'bet_lock', -p_stake, v_balance_after,
     v_bet_id,
     CASE WHEN v_using_book THEN 'Bet placed (book quote)' ELSE 'Bet placed (indicative odds — book unavailable)' END);

  RETURN v_bet_id;
END;
$$;

COMMENT ON FUNCTION place_bet(uuid, uuid, numeric, numeric) IS
  'Places a bet. Polymarket parity: no arbitrary price floor; only the degenerate exact-0 / exact-1 outcomes are refused at the price gate. Uses quote_bet_payout when a book row exists; falls back to indicative market_outcomes.effective_odds when the book is missing. Always rejects stale books and partial fills when the book IS present. Antifraud: 3-min outcome staleness, 5s book staleness, 2% drift tolerance.';
