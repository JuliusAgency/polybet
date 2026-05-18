-- Migration: place_bet — graceful fallback when book is unavailable
--
-- The previous migration (20260518101742_place_bet_use_book_quote) made
-- place_bet hard-fail on missing/partial book data. That's correct once
-- market_outcome_books is populated for every tradable outcome, but in the
-- rollout window (or for low-volume outcomes the market-tracker is not yet
-- subscribed to), it locks users out of bets that Polymarket would happily
-- accept. QA hit exactly that on the US×Iran market.
--
-- New behaviour:
--   * Book row exists AND fresh AND fills the stake → use book quote (target
--     state; this is what catches arbitrage on liquid outcomes).
--   * Book row missing entirely (book_updated_at IS NULL) → fall back to
--     stake * market_outcomes.effective_odds (legacy path). Drift-guard runs
--     against the indicative odds in this case.
--   * Book row exists but stale → reject (safety contour stays active).
--   * Book row exists, fresh, but partial fill → reject (we have real
--     liquidity data and it says the stake can't fill).
--
-- This keeps anti-arbitrage strong on outcomes the system already tracks and
-- preserves usability for outcomes it doesn't (yet).

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
  c_max_price            CONSTANT numeric  := 0.999;
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

  IF v_price IS NULL OR v_price < c_min_price THEN
    RAISE EXCEPTION 'Outcome is untradable (price at floor)';
  END IF;

  IF v_price >= c_max_price THEN
    RAISE EXCEPTION 'Outcome is untradable (price at ceiling)';
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
  'Places a bet. Uses quote_bet_payout when a book row exists; falls back to indicative market_outcomes.effective_odds when the book is missing (e.g. rollout window or untracked low-volume outcome). Always rejects stale books and partial fills when the book IS present.';
