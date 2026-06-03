-- Migration: quote_sell_proceeds + sell_position — the SELL (early-exit) path
--
-- The house is the counterparty; the Polymarket bid side is the price oracle.
-- Selling = the house buys the user's shares back at the slippage-adjusted bid
-- price, extinguishing the obligation. The house captures the bid/ask spread
-- (the user entered on the ask side), so early exits are economically neutral-
-- to-positive for the house. The same antifraud guards as the buy path bound
-- arbitrage on a stale book.
--
-- Two pieces:
--   1. quote_sell_proceeds(token_id, shares) — STABLE helper mirroring
--      quote_bet_payout, but walks the bids[] (descending price) accumulating
--      USD proceeds for selling `shares`. Returns partial=true when bid depth
--      cannot absorb the full size; filled_shares then doubles as "max sellable".
--   2. sell_position(position_id, shares, expected_price) — debits shares from
--      a position, credits proceeds to available, releases the sold cost basis
--      from in_play, crystallizes realized P/L, appends a sell trade and a
--      bet_sell ledger row. Partial fills are REJECTED (the client must resize
--      to filled_shares) rather than auto-filled.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. quote_sell_proceeds — walk bids for sell proceeds
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION quote_sell_proceeds(
  p_token_id text,
  p_shares   numeric
) RETURNS TABLE (
  proceeds        numeric,
  filled_shares   numeric,
  avg_price       numeric,
  partial         boolean,
  book_updated_at timestamptz
)
LANGUAGE plpgsql STABLE
SET search_path = public AS $$
DECLARE
  v_bids       numeric[];
  v_updated    timestamptz;
  v_i          int := 1;
  v_len        int;
  v_remaining  numeric := p_shares;
  v_price      numeric;
  v_size       numeric;
  v_take_units numeric;
  v_proceeds   numeric := 0;
  v_filled     numeric := 0;
BEGIN
  IF p_shares IS NULL OR p_shares <= 0 THEN
    RETURN QUERY SELECT 0::numeric, 0::numeric, 0::numeric, true, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT bids, updated_at
  INTO v_bids, v_updated
  FROM market_outcome_books
  WHERE polymarket_token_id = p_token_id;

  IF v_bids IS NULL OR cardinality(v_bids) < 2 THEN
    -- No book row, or row exists but bids is empty. Zero exit liquidity.
    RETURN QUERY SELECT 0::numeric, 0::numeric, 0::numeric, true, v_updated;
    RETURN;
  END IF;

  v_len := cardinality(v_bids);

  -- Walk bids. Stored flat as [p0, s0, p1, s1, ...] sorted DESCENDING by price
  -- (bookWriter serializeSide(..., true) guarantees this). size is in shares.
  -- Take min(remaining_shares, level_size) at each step; proceeds = shares*price.
  WHILE v_i < v_len AND v_remaining > 0 LOOP
    v_price := v_bids[v_i];
    v_size  := v_bids[v_i + 1];

    IF v_price IS NULL OR v_size IS NULL OR v_price <= 0 OR v_size <= 0 THEN
      v_i := v_i + 2;
      CONTINUE;
    END IF;

    v_take_units := LEAST(v_remaining, v_size);
    v_proceeds   := v_proceeds + v_take_units * v_price;
    v_filled     := v_filled + v_take_units;
    v_remaining  := v_remaining - v_take_units;
    v_i          := v_i + 2;
  END LOOP;

  RETURN QUERY SELECT
    v_proceeds                                                  AS proceeds,
    v_filled                                                    AS filled_shares,
    CASE WHEN v_filled > 0 THEN v_proceeds / v_filled ELSE 0 END AS avg_price,
    v_remaining > 0                                             AS partial,
    v_updated                                                   AS book_updated_at;
END;
$$;

-- A financial pricing helper should not be anon-callable. Supabase's default
-- privileges grant EXECUTE to anon EXPLICITLY on function creation (not via
-- PUBLIC), so revoke from anon directly — REVOKE FROM public alone leaves the
-- explicit anon grant intact.
REVOKE ALL ON FUNCTION quote_sell_proceeds(text, numeric) FROM public;
REVOKE ALL ON FUNCTION quote_sell_proceeds(text, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION quote_sell_proceeds(text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION quote_sell_proceeds(text, numeric) TO service_role;

COMMENT ON FUNCTION quote_sell_proceeds(text, numeric) IS
  'Walks market_outcome_books.bids for p_token_id and returns slippage-adjusted USD proceeds for selling p_shares. partial=true when bid depth is insufficient; filled_shares is then the max sellable size.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. sell_position — early exit (full or partial)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sell_position(
  p_position_id    uuid,
  p_shares         numeric,
  p_expected_price numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  c_max_staleness         CONSTANT interval := interval '3 minutes';
  c_book_max_staleness    CONSTANT interval := interval '5 seconds';
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
$$;

REVOKE ALL ON FUNCTION sell_position(uuid, numeric, numeric) FROM public;
REVOKE ALL ON FUNCTION sell_position(uuid, numeric, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION sell_position(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION sell_position(uuid, numeric, numeric) TO service_role;

COMMENT ON FUNCTION sell_position(uuid, numeric, numeric) IS
  'SELL (early exit) in the positions/trades model. Sells p_shares of the caller''s own open position at the slippage-adjusted bid price, crediting proceeds to available, releasing the sold cost basis from in_play, crystallizing realized P/L into the position and a sell trade + bet_sell ledger row. Requires a fresh (<=5s) non-partial bid quote on an open+visible market. Rejects partial fills (resize to filled_shares). 2% price-drift guard (ERRCODE P0002).';
