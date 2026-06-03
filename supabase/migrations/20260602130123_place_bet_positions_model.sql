-- Migration: place_bet writes the positions/trades model (BUY path)
--
-- place_bet keeps its exact signature and every antifraud guard from
-- 20260601153519 verbatim (status gate, 3-min staleness, mandatory <=5s book
-- quote, partial-fill rejection, 2% drift tolerance, max-odds cap, effective
-- bet-limit hierarchy, balance lock). The ONLY change is the write block:
--
--   OLD: INSERT INTO bets (...); balance bet_lock with bet_id.
--   NEW: upsert positions (weighted-average aggregate) + append one buy trade +
--        balance bet_lock keyed on trade_id/position_id.
--
-- Position upsert (ON CONFLICT user_id,outcome_id):
--   * brand new        → insert shares/avg_price/cost_basis, status='open'.
--   * existing open     → add shares, recompute volume-weighted avg_price,
--                         add to cost_basis (realized_pnl carries unchanged).
--   * existing closed   → reopen: same arithmetic (old shares/cost are 0), reset
--                         opened_at + clear settled_at, realized_pnl carries.
--   A won/lost position can never be hit here: its market is resolved, so the
--   status='open' market gate rejects the buy long before the upsert.
--
-- bets is no longer written. Existing bets rows are frozen historical data and
-- are converted to positions by the backfill migration. RETURNS the position id
-- (was the bet id) — a uuid either way, so the supabase-js caller is unaffected.
--
-- Drop the legacy 3-arg overload place_bet(uuid,uuid,numeric). It has existed
-- alongside the 4-arg version since migration 20260514091027 (CREATE OR REPLACE
-- only replaces the same signature), is anon/authenticated-callable, has NO
-- search_path, bypasses the book-quote antifraud, and — critically in the new
-- model — still writes the FROZEN bets table, which would lock in_play that the
-- positions-based settle_market never releases. No caller uses the 3-arg form
-- (the frontend and tests always pass expected_odds).
DROP FUNCTION IF EXISTS place_bet(uuid, uuid, numeric);

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
  v_locked_odds     numeric;
  v_shares          numeric;
  v_avg_price       numeric;
  v_position_id     uuid;
  v_balance_after   numeric;
  v_limit           numeric;

  v_quote_shares      numeric;
  v_quote_avg_price   numeric;
  v_quote_eff_odds    numeric;
  v_quote_partial     boolean;
  v_quote_book_at     timestamptz;

  v_trade_id          uuid;
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
  v_locked_odds := v_quote_eff_odds;   -- = shares/stake, used only for the drift guard

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

  -- Upsert the position. Buys of the same outcome aggregate into one row with a
  -- volume-weighted avg_price. EXCLUDED.* carries this fill's values; the
  -- positions.* references are the existing row (pre-update). cost_basis grows
  -- by exactly the stake (= USD locked into in_play for this fill).
  INSERT INTO positions AS p
    (user_id, market_id, outcome_id, shares, avg_price, cost_basis, status, opened_at, updated_at)
  VALUES
    (v_user_id, p_market_id, p_outcome_id, v_shares, v_avg_price, p_stake, 'open', now(), now())
  ON CONFLICT (user_id, outcome_id) DO UPDATE SET
    shares     = p.shares + EXCLUDED.shares,
    cost_basis = p.cost_basis + EXCLUDED.cost_basis,
    avg_price  = (p.cost_basis + EXCLUDED.cost_basis) / (p.shares + EXCLUDED.shares),
    status     = 'open',
    settled_at = NULL,
    -- Reopen a previously sold-out position with a fresh opened_at; an
    -- already-open position keeps its original opened_at.
    opened_at  = CASE WHEN p.status = 'closed' THEN now() ELSE p.opened_at END,
    updated_at = now()
  RETURNING p.id INTO v_position_id;

  -- Append the immutable buy fill.
  INSERT INTO trades
    (position_id, user_id, market_id, outcome_id, side, shares, price, usd, realized_pnl)
  VALUES
    (v_position_id, v_user_id, p_market_id, p_outcome_id, 'buy', v_shares, v_avg_price, p_stake, 0)
  RETURNING id INTO v_trade_id;

  UPDATE balances
  SET available  = available - p_stake,
      in_play    = in_play + p_stake,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO balance_transactions
    (user_id, initiated_by, type, amount, balance_after, trade_id, position_id, note)
  VALUES
    (v_user_id, v_user_id, 'bet_lock', -p_stake, v_balance_after, v_trade_id, v_position_id, 'Shares bought');

  RETURN v_position_id;
END;
$$;

COMMENT ON FUNCTION place_bet(uuid, uuid, numeric, numeric) IS
  'BUY in the positions/trades model. Upserts a per-(user,outcome) position with volume-weighted avg_price, appends a buy trade, locks stake into in_play, records a bet_lock ledger row (trade_id/position_id). Availability gated by status=''open'' AND is_visible (NOT close_at). Requires a fresh (<=5s) non-partial book quote. Antifraud guards identical to the pre-positions place_bet. Returns the position id.';
