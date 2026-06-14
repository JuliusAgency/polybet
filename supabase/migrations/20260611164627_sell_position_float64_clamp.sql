-- BUG FIX (client report 2026-06-11): "Max" sell rejected with
-- 'Cannot sell more shares than held'.
--
-- positions.shares is an arbitrary-precision numeric (e.g.
-- 2058.823529411764709). The client receives it as a JSON float64, which can
-- round UP to the nearest representable double (2058.823529411765). The Max
-- button echoes that float64 back into sell_position, where the exact numeric
-- comparison `p_shares > v_pos.shares` sees a (sub-ULP) oversell and rejects —
-- so a full liquidation is impossible without hand-editing the amount.
--
-- Fix: clamp. A request exceeding the held shares by at most
-- GREATEST(shares * 1e-9, c_dust) is float64 serialization noise, not an
-- oversell — treat it as "sell everything" by clamping p_shares to the held
-- amount. One ULP at this magnitude is ~4.5e-13 relative, so a 1e-9 relative
-- epsilon has ~3 orders of magnitude of headroom while being economically
-- negligible; the c_dust floor covers tiny positions. Genuine oversells still
-- raise. The clamped p_shares flows into the quote, the trade row and the
-- returned sold_shares, so the ledger records what was actually sold.
--
-- Body below is the EXACT current definition (20260610132925, extracted via
-- pg_get_functiondef) with only the clamp block inserted before the oversell
-- check — no other logic changed.

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

  -- Float64 tolerance clamp (client bug 2026-06-11): the client receives
  -- `shares` as a JSON float64, which can round UP vs the exact numeric held
  -- (DB 2058.823529411764709 -> JS 2058.823529411765). An overshoot within a
  -- relative epsilon is the user selling EVERYTHING, not an oversell.
  IF p_shares > v_pos.shares
     AND p_shares - v_pos.shares <= GREATEST(v_pos.shares * 1e-9, c_dust) THEN
    p_shares := v_pos.shares;
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
$function$;
