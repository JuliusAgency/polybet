-- Gate place_bet / sell_position on the LIVE order book, not the 3-minute
-- indicative price-feed recency.
--
-- BUG (reported 2026-06-24): ~70% of bets failed with "Market data is not up to
-- date. Refresh the bet and try again." (i18n key markets.priceStaleRetry) and
-- refreshing did not help.
--
-- ROOT CAUSE (measured on prod 2026-06-24): of 12,000 markets exposed as
-- tradable (status='open' AND is_visible), only ~14% had market_outcomes.updated_at
-- within the 3-minute c_max_staleness bound; ~58% were stale by >6h (some by
-- weeks). place_bet/sell_position rejected with 'Market price feed is stale'
-- (markets.last_synced_at) or 'Outcome price feed is stale'
-- (market_outcomes.updated_at) for that long tail. Crucially the on-demand warm
-- path the user triggers at confirm time (the quote-bet / quote-sell edge
-- functions) only refreshes the ORDER BOOK (market_outcome_books), never the
-- indicative feed — so "refresh the bet and try again" re-warmed the book but
-- left the indicative timestamps stale, and the bet kept failing. Only the
-- small hot-set cron (*/5 min) + WS-subscribed markets keep the indicative feed
-- fresh, so the 3-min gate is structurally incompatible with a 12k-market
-- catalog.
--
-- WHY REMOVING THE GUARDS IS SAFE in the positions/exchange model:
--   * The execution price is NOT the indicative market_outcomes.price. It comes
--     from walking the live CLOB order book (quote_bet_payout / quote_sell_proceeds).
--   * The book quote is MANDATORY (book_updated_at NOT NULL) and must be <=30s
--     fresh (c_book_max_staleness) — this is the real-time price + liveness gate,
--     re-warmed on demand by quote-bet/quote-sell right before confirm.
--   * The 2% drift guard still rejects any bet/sell whose book price moved past
--     tolerance vs. what the user saw.
--   * A market that has actually resolved/closed on Polymarket has NO live book,
--     so quote-bet returns book_updated_at=NULL ("Market book unavailable") and a
--     stale cached book ages past 30s ("Market book is stale") — the book guard
--     still blocks genuinely untradable markets.
--   * status='open' AND is_visible (our side's authority) and the non-time price
--     sanity checks (price NOT NULL, 0 < price < 1, odds <= 1000) are UNCHANGED.
--
-- The indicative-feed staleness (markets.last_synced_at, market_outcomes.updated_at)
-- remains an honest signal for sync-health monitoring (get_sync_health) — we just
-- stop using it as a betting gate.
--
-- Functions are redefined verbatim from the live prod definitions (place_bet with
-- the 2026-06-10 active-account guard; sell_position with the active-account guard
-- + 2026-06-11 float64 clamp). The ONLY changes are: drop c_max_staleness, drop
-- the indicative-feed staleness RAISE blocks, and drop the now-unused
-- last_synced_at / created_at / outcome updated_at reads. The 30s book bound and
-- the 2% drift guard are untouched. CREATE OR REPLACE preserves the existing ACL.

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
  c_book_max_staleness   CONSTANT interval := interval '30 seconds';
  c_odds_drift_tolerance CONSTANT numeric  := 0.02;

  v_user_id         uuid := auth.uid();
  v_available       numeric;
  v_token_id        text;
  v_indicative_odds numeric;
  v_price           numeric;
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
  --
  -- The 3-minute indicative price-feed staleness guard (markets.last_synced_at)
  -- was removed 2026-06-24: in the positions model the live order book below is
  -- the authoritative price + liveness gate (mandatory, <=30s, on-demand warmed),
  -- so gating on the Gamma-sync recency only false-rejected the long tail of the
  -- catalog. See migration header for the full rationale.
  PERFORM 1
  FROM markets
  WHERE id = p_market_id
    AND status = 'open'
    AND is_visible = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market is not available for betting';
  END IF;

  -- Outcome read & validate (non-time price sanity checks only).
  SELECT polymarket_token_id, effective_odds, price
  INTO v_token_id, v_indicative_odds, v_price
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

  -- Book quote is MANDATORY — there is no mid-price fallback. This (not the
  -- indicative feed) is the real-time price + liveness gate.
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
  'BUY in the positions/trades model. Gate is the LIVE order book (quote_bet_payout: mandatory, <=30s fresh, 2% drift), NOT the 3-min indicative feed (removed 2026-06-24 — see migration 20260624162430). Availability still gated by status=''open'' AND is_visible (NOT close_at) + price sanity (0<price<1, odds<=1000). Upserts a per-(user,outcome) position with volume-weighted avg_price, appends a buy trade, locks stake into in_play, records a bet_lock ledger row. Returns the position id.';

CREATE OR REPLACE FUNCTION sell_position(
  p_position_id    uuid,
  p_shares         numeric,
  p_expected_price numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  c_book_max_staleness    CONSTANT interval := interval '30 seconds';
  c_price_drift_tolerance CONSTANT numeric  := 0.02;
  c_dust                  CONSTANT numeric  := 0.0000001;

  v_user_id        uuid := auth.uid();
  v_pos            record;
  v_market_id      uuid;
  v_token_id       text;

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

  -- Market gate mirrors place_bet: must be open + visible on our side.
  -- close_at is informational (see 20260601153519). The 3-minute indicative
  -- price-feed staleness guard was removed 2026-06-24: the live bid book below
  -- (mandatory, <=30s) is the authoritative price + liveness gate, and blocking
  -- EXITS on a stale Gamma feed needlessly trapped user funds. See migration
  -- header for the full rationale.
  PERFORM 1
  FROM markets
  WHERE id = v_market_id
    AND status = 'open'
    AND is_visible = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market is not available for selling';
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
$$;

COMMENT ON FUNCTION sell_position(uuid, numeric, numeric) IS
  'SELL (early exit) in the positions/trades model. Gate is the LIVE bid book (quote_sell_proceeds: mandatory, <=30s fresh, 2% drift), NOT the 3-min indicative feed (removed 2026-06-24 — see migration 20260624162430). Sells p_shares of the caller''s own open position at the slippage-adjusted bid price, crediting proceeds to available, releasing the sold cost basis from in_play, crystallizing realized P/L into the position and a sell trade + bet_sell ledger row. Requires open+visible market. Rejects partial fills (resize to filled_shares). 2% price-drift guard (ERRCODE P0002).';

-- ACL hygiene. CREATE OR REPLACE preserves the prior ACL, but the live place_bet
-- ACL still carried EXECUTE for public + anon (legacy; never hardened like
-- sell_position was in 20260603100437). place_bet self-rejects unauthenticated
-- callers ('Authentication required') + inactive accounts, so this was not
-- exploitable, but anon/public can never legitimately place a bet — align it with
-- sell_position. authenticated + service_role keep EXECUTE. Re-issuing
-- sell_position's block too keeps this migration self-contained.
REVOKE ALL ON FUNCTION place_bet(uuid, uuid, numeric, numeric) FROM public;
REVOKE ALL ON FUNCTION place_bet(uuid, uuid, numeric, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION place_bet(uuid, uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION place_bet(uuid, uuid, numeric, numeric) TO service_role;

REVOKE ALL ON FUNCTION sell_position(uuid, numeric, numeric) FROM public;
REVOKE ALL ON FUNCTION sell_position(uuid, numeric, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION sell_position(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION sell_position(uuid, numeric, numeric) TO service_role;
