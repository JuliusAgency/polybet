-- place_bet: gate availability by `status`, not by `close_at`.
--
-- Why: Polymarket is the source of truth for whether a market is closed via its
-- `closed`/`resolved` flags (synced into markets.status). Its `endDate` (our
-- close_at) is unreliable as a gate — Polymarket keeps some markets tradable
-- (closed=false) past their stated endDate, and occasionally ships an endDate
-- that contradicts the market title (observed: a "June 30, 2026" market with
-- endDate=May 31, closed=false, still trading on Polymarket). The old
-- `close_at > now()` gate mis-rejected such markets even though Polymarket was
-- still accepting trades on them.
--
-- This removes `close_at IS NOT NULL AND close_at > now()` from the market
-- lock predicate. status='open' AND is_visible remain the gate. close_at is now
-- purely informational (display). The frontend effectiveStatus subsystem was
-- updated in lockstep (entities/market/effectiveStatus.ts, statusFilter.ts,
-- cards) to also rely on status.
--
-- Staleness protection is UNCHANGED: last_synced_at <= 3 min still bounds how
-- stale `status` can be, so a market Polymarket has just closed cannot stay
-- bettable for more than one sync tick. All other shares-model guards (book
-- required <=5s, partial-fill rejection, drift, max-odds cap, bet limit) are
-- preserved verbatim from 20260601133349.

CREATE OR REPLACE FUNCTION place_bet(
  p_market_id      uuid,
  p_outcome_id     uuid,
  p_stake          numeric,
  p_expected_odds  numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
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
  -- Availability is gated by status (Polymarket authority) + visibility ONLY.
  -- close_at is informational and intentionally NOT part of this predicate.
  SELECT last_synced_at, created_at
  INTO v_market_synced, v_market_created
  FROM markets
  WHERE id = p_market_id
    AND status = 'open'
    AND is_visible = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market is not available for betting';
  END IF;

  -- Market price feed freshness (bounds how stale `status` can be).
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

  IF v_price <= c_min_price OR v_price >= c_max_price THEN
    RAISE EXCEPTION 'Outcome is out of tradable range';
  END IF;

  IF v_indicative_odds > c_max_odds THEN
    RAISE EXCEPTION 'Outcome odds out of bounds';
  END IF;

  IF v_outcome_updated IS NULL OR v_outcome_updated < now() - c_max_staleness THEN
    RAISE EXCEPTION 'Outcome price feed is stale';
  END IF;

  -- Book quote is MANDATORY — there is no mid-price fallback.
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

  -- Drift-guard against the book-derived effective_odds.
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
  'Places a bet (shares model). Availability gated by status=''open'' AND is_visible — NOT by close_at (Polymarket trades some markets past their stated endDate; close_at is informational). Requires a fresh (<=5s) non-partial order-book quote. Antifraud: 3-min market/outcome staleness (bounds status staleness), 5s book staleness, 2% drift tolerance, partial-fill rejection, max-odds cap, effective bet-limit hierarchy.';
