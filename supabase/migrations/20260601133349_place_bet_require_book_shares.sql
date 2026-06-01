-- Migration B: place_bet requires a live order book and stores shares
--
-- Shares model finalisation. Two changes vs 20260520143159:
--   1. The indicative mid-price fallback is REMOVED. A bet now requires a
--      fresh (<=5s), non-partial order-book quote. If the book row is missing
--      (book_updated_at IS NULL) the bet is rejected with
--      'Market book unavailable'. Rationale: the book is the only honest
--      source of the fill price; a mid-price fallback let users buy shares at
--      a price the market could not actually fill. quote-bet (edge fn) writes
--      the book on every BetSlip stake change and the market-tracker writes it
--      continuously, so an open BetSlip keeps the row fresh.
--   2. The bet now persists shares + avg_price (from quote_bet_payout). It
--      still writes locked_odds (= shares/stake) and potential_payout
--      (= shares) so the DEPRECATED columns stay consistent for back-compat
--      readers and for settle_market's COALESCE fallback.
--
-- Unchanged antifraud guarantees: 3-min market & outcome staleness, 5s book
-- staleness, 2% drift tolerance, partial-fill rejection, c_max_odds cap,
-- effective max bet limit hierarchy, balance lock.
--
-- Drift guard: still accepts p_expected_odds and compares against the
-- book-derived effective_odds (= shares/stake = 1/avg_price). The client keeps
-- sending its observed effective_odds; for small moves this is equivalent to a
-- price tolerance, so no cross-layer rename is needed this release. A future
-- follow-up may switch to p_expected_price / 'Price changed'.

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
  -- partial-fill check below rejects degenerate stakes. Only exact-0 / exact-1
  -- prices are refused since there is literally nothing to buy/lose there.
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
  v_shares          numeric;
  v_avg_price       numeric;
  v_bet_id          uuid;
  v_balance_after   numeric;
  v_limit           numeric;

  v_quote_shares      numeric;
  v_quote_avg_price   numeric;
  v_quote_eff_odds    numeric;
  v_quote_partial     boolean;
  v_quote_book_at     timestamptz;
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

  -- Book quote is now MANDATORY — there is no mid-price fallback.
  SELECT shares, avg_price, effective_odds, partial, book_updated_at
  INTO v_quote_shares, v_quote_avg_price, v_quote_eff_odds, v_quote_partial, v_quote_book_at
  FROM quote_bet_payout(v_token_id, p_stake);

  IF v_quote_book_at IS NULL THEN
    RAISE EXCEPTION 'Market book unavailable';
  END IF;

  IF v_quote_book_at < now() - c_book_max_staleness THEN
    RAISE EXCEPTION 'Market book is stale';
  END IF;

  IF v_quote_partial OR v_quote_shares <= 0 THEN
    RAISE EXCEPTION 'Insufficient liquidity for this stake';
  END IF;

  IF v_quote_eff_odds > c_max_odds THEN
    RAISE EXCEPTION 'Outcome odds out of bounds';
  END IF;

  v_shares      := v_quote_shares;
  v_avg_price   := v_quote_avg_price;
  v_locked_odds := v_quote_eff_odds;   -- DEPRECATED mirror = shares/stake
  v_payout      := v_quote_shares;     -- DEPRECATED mirror = shares

  -- Drift-guard: client sent its observed odds. Compare against the
  -- book-derived effective_odds that drives this payout.
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

  INSERT INTO bets (user_id, market_id, outcome_id, stake, locked_odds, potential_payout, shares, avg_price)
  VALUES (v_user_id, p_market_id, p_outcome_id, p_stake, v_locked_odds, v_payout, v_shares, v_avg_price)
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

COMMENT ON FUNCTION place_bet(uuid, uuid, numeric, numeric) IS
  'Places a bet in the shares model. Requires a fresh (<=5s), non-partial order-book quote from quote_bet_payout — there is NO mid-price fallback; a missing book rejects with "Market book unavailable". Persists shares + avg_price (and DEPRECATED mirrors locked_odds=shares/stake, potential_payout=shares). Antifraud: 3-min market/outcome staleness, 5s book staleness, 2% drift tolerance, partial-fill rejection, max-odds cap, effective bet-limit hierarchy.';
