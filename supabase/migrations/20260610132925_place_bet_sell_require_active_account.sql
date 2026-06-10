-- SECURITY (audit 2026-06-10): block inactive accounts from trading.
--
-- place_bet / sell_position only checked auth.uid() IS NOT NULL. A user blocked
-- by a manager/admin (profiles.is_active = false) keeps a valid Supabase
-- session (blocking does not revoke tokens), so they could call the RPC
-- directly via POST /rest/v1/rpc/place_bet and keep trading. Add an is_active
-- gate right after the authentication check in both functions.
--
-- Bodies below are the EXACT current definitions (extracted via
-- pg_get_functiondef) with only the guard block inserted — no other logic
-- changed.

CREATE OR REPLACE FUNCTION public.place_bet(p_market_id uuid, p_outcome_id uuid, p_stake numeric, p_expected_odds numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_min_price            CONSTANT numeric  := 0;
  c_max_price            CONSTANT numeric  := 1;
  c_max_odds             CONSTANT numeric  := 1000;
  c_max_staleness        CONSTANT interval := interval '3 minutes';
  c_book_max_staleness   CONSTANT interval := interval '30 seconds';
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

  -- SECURITY: reject blocked / inactive accounts (audit 2026-06-10).
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND is_active = true) THEN
    RAISE EXCEPTION 'Account is inactive';
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
$function$

;

CREATE OR REPLACE FUNCTION public.sell_position(p_position_id uuid, p_shares numeric, p_expected_price numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_max_staleness         CONSTANT interval := interval '3 minutes';
  c_book_max_staleness    CONSTANT interval := interval '30 seconds';
  c_price_drift_tolerance CONSTANT numeric  := 0.02;
  c_dust                  CONSTANT numeric  := 0.0000001;

  v_user_id        uuid := auth.uid();
  v_pos            record;
  v_market_id      uuid;
  v_token_id       text;
  v_market_synced  timestamptz;
  v_market_created timestamptz;

  v_proceeds       numeric;
  v_filled         numeric;
  v_sell_price     numeric;
  v_partial        boolean;
  v_book_at        timestamptz;

  v_cost_sold      numeric;
  v_realized       numeric;
  v_new_shares     numeric;
  v_new_cost       numeric;
  v_new_status     text;
  v_available      numeric;
  v_balance_after  numeric;
  v_trade_id       uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- SECURITY: reject blocked / inactive accounts (audit 2026-06-10).
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND is_active = true) THEN
    RAISE EXCEPTION 'Account is inactive';
  END IF;

  IF p_shares IS NULL OR p_shares <= 0 THEN
    RAISE EXCEPTION 'Shares to sell must be positive';
  END IF;

  IF p_expected_price IS NOT NULL AND p_expected_price <= 0 THEN
    RAISE EXCEPTION 'Expected price must be positive';
  END IF;

  -- Discover the position's market WITHOUT locking, so we can take the market
  -- lock FIRST — matching place_bet's lock order (market -> ... -> position).
  -- The reverse order (position then market) deadlocks against a concurrent buy
  -- on the same outcome (buy holds market, wants position; sell holds position,
  -- wants market).
  SELECT market_id INTO v_market_id
  FROM positions
  WHERE id = p_position_id AND user_id = v_user_id AND status = 'open';

  IF v_market_id IS NULL THEN
    RAISE EXCEPTION 'Position not found or not sellable';
  END IF;

  -- Market gate mirrors place_bet: must be open + visible on our side, with a
  -- fresh price feed. close_at is informational (see 20260601153519).
  SELECT last_synced_at, created_at
  INTO v_market_synced, v_market_created
  FROM markets
  WHERE id = v_market_id
    AND status = 'open'
    AND is_visible = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market is not available for selling';
  END IF;

  IF v_market_synced IS NULL THEN
    IF v_market_created IS NULL OR v_market_created < now() - c_max_staleness THEN
      RAISE EXCEPTION 'Market price feed is stale';
    END IF;
  ELSIF v_market_synced < now() - c_max_staleness THEN
    RAISE EXCEPTION 'Market price feed is stale';
  END IF;

  -- Now lock the position (after the market). Re-validate: status could have
  -- flipped between the unlocked read and acquiring the market lock.
  SELECT * INTO v_pos
  FROM positions
  WHERE id = p_position_id AND user_id = v_user_id AND status = 'open'
  FOR UPDATE;

  IF v_pos.id IS NULL THEN
    RAISE EXCEPTION 'Position not found or not sellable';
  END IF;

  IF p_shares > v_pos.shares THEN
    RAISE EXCEPTION 'Cannot sell more shares than held (have %, requested %)',
      v_pos.shares, p_shares;
  END IF;

  SELECT polymarket_token_id INTO v_token_id
  FROM market_outcomes
  WHERE id = v_pos.outcome_id;

  IF v_token_id IS NULL THEN
    RAISE EXCEPTION 'Outcome is not tradable (no Polymarket token)';
  END IF;

  -- Mandatory fresh bid quote — symmetric with the buy path, no fallback.
  SELECT proceeds, filled_shares, avg_price, partial, book_updated_at
  INTO v_proceeds, v_filled, v_sell_price, v_partial, v_book_at
  FROM quote_sell_proceeds(v_token_id, p_shares);

  IF v_book_at IS NULL THEN
    RAISE EXCEPTION 'Market book unavailable';
  END IF;

  IF v_book_at < now() - c_book_max_staleness THEN
    RAISE EXCEPTION 'Market book is stale';
  END IF;

  -- Reject partial fills; the client resizes to filled_shares (max sellable).
  IF v_partial OR v_filled < p_shares OR v_proceeds <= 0 THEN
    RAISE EXCEPTION 'Insufficient liquidity to sell this many shares';
  END IF;

  -- Drift guard against the bid-derived average sell price the user saw.
  -- p_expected_price > 0 was validated up front, so the guard cannot be
  -- bypassed by passing 0.
  IF p_expected_price IS NOT NULL THEN
    IF abs(v_sell_price - p_expected_price) / p_expected_price > c_price_drift_tolerance THEN
      RAISE EXCEPTION 'Price changed (expected %, actual %)',
        p_expected_price, v_sell_price
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Release the sold cost basis from in_play; the rest of the proceeds (the
  -- realized P/L) lands in available.
  v_new_shares := v_pos.shares - p_shares;

  IF v_new_shares <= c_dust THEN
    -- Sold out (within dust): release EXACTLY the remaining cost basis so no
    -- residual is stranded in in_play, and close the position. Using
    -- v_pos.cost_basis (not p_shares*avg_price) makes the release exact even
    -- after numeric drift from prior partial sells.
    v_new_shares := 0;
    v_cost_sold  := v_pos.cost_basis;
    v_new_cost   := 0;
    v_new_status := 'closed';
  ELSE
    v_cost_sold  := p_shares * v_pos.avg_price;
    -- Floor at 0 to absorb sub-ULP numeric residue (CHECK cost_basis >= 0).
    v_new_cost   := GREATEST(v_pos.cost_basis - v_cost_sold, 0);
    v_new_status := 'open';
  END IF;

  v_realized := v_proceeds - v_cost_sold;

  -- Lock balance to serialize with concurrent buys/sells.
  SELECT available INTO v_available
  FROM balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  v_balance_after := v_available + v_proceeds;

  UPDATE positions
  SET shares       = v_new_shares,
      cost_basis   = v_new_cost,
      realized_pnl = realized_pnl + v_realized,
      status       = v_new_status,
      updated_at   = now()
  WHERE id = v_pos.id;

  INSERT INTO trades
    (position_id, user_id, market_id, outcome_id, side, shares, price, usd, realized_pnl)
  VALUES
    (v_pos.id, v_user_id, v_pos.market_id, v_pos.outcome_id, 'sell',
     p_shares, v_sell_price, v_proceeds, v_realized)
  RETURNING id INTO v_trade_id;

  UPDATE balances
  SET available  = available + v_proceeds,
      in_play    = in_play - v_cost_sold,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO balance_transactions
    (user_id, initiated_by, type, amount, balance_after, trade_id, position_id, note)
  VALUES
    (v_user_id, v_user_id, 'bet_sell', v_proceeds, v_balance_after, v_trade_id, v_pos.id, 'Shares sold');

  RETURN jsonb_build_object(
    'position_id',   v_pos.id,
    'trade_id',      v_trade_id,
    'sold_shares',   p_shares,
    'proceeds',      v_proceeds,
    'avg_sell_price', v_sell_price,
    'realized_pnl',  v_realized,
    'remaining_shares', v_new_shares,
    'status',        v_new_status
  );
END;
$function$

;
