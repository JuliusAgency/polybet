-- Migration: admin_place_demo_bet writes the positions/trades model
--
-- The super-admin TestLab demo-bet tool still wrote the FROZEN bets table with
-- an odds-based payout. In the positions model that orphans the stake: it locks
-- in_play but the positions-based settle_market never settles it, so the user's
-- balance stays stuck forever (the same class of bug as the legacy 3-arg
-- place_bet that was dropped in 20260602130123). Repoint it to upsert a position
-- + append a buy trade, exactly like place_bet's write block.
--
-- This is an admin/testing tool, so it deliberately skips the order-book quote
-- and antifraud guards: shares are derived from the outcome's indicative price
-- (shares = stake / price, avg_price = price). Adds SET search_path = public
-- (the old definition lacked it).

CREATE OR REPLACE FUNCTION admin_place_demo_bet(
  p_user_id    uuid,
  p_market_id  uuid,
  p_outcome_id uuid,
  p_stake      numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_price         numeric;
  v_available     numeric;
  v_shares        numeric;
  v_avg_price     numeric;
  v_position_id   uuid;
  v_trade_id      uuid;
  v_balance_after numeric;
BEGIN
  -- Only super_admin may call this.
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: only super_admin can place demo bets';
  END IF;

  IF p_stake IS NULL OR p_stake <= 0 THEN
    RAISE EXCEPTION 'Stake must be positive';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Market must be open (visibility not required for admin).
  IF NOT EXISTS (
    SELECT 1 FROM markets WHERE id = p_market_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Market is not open';
  END IF;

  -- Outcome must belong to this market and have a tradable indicative price.
  SELECT price INTO v_price
  FROM market_outcomes
  WHERE id = p_outcome_id AND market_id = p_market_id;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Invalid outcome for this market';
  END IF;
  IF v_price <= 0 OR v_price >= 1 THEN
    RAISE EXCEPTION 'Outcome price is out of tradable range';
  END IF;

  -- Demo tool: derive shares from the indicative price (no order book quote).
  v_shares    := p_stake / v_price;
  v_avg_price := v_price;

  -- Lock user balance row and check funds.
  SELECT available INTO v_available
  FROM balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_available IS NULL OR v_available < p_stake THEN
    RAISE EXCEPTION 'Insufficient balance for user';
  END IF;

  v_balance_after := v_available - p_stake;

  -- Upsert the position (same weighted-average aggregate as place_bet).
  INSERT INTO positions AS p
    (user_id, market_id, outcome_id, shares, avg_price, cost_basis, status, opened_at, updated_at)
  VALUES
    (p_user_id, p_market_id, p_outcome_id, v_shares, v_avg_price, p_stake, 'open', now(), now())
  ON CONFLICT (user_id, outcome_id) DO UPDATE SET
    shares     = p.shares + EXCLUDED.shares,
    cost_basis = p.cost_basis + EXCLUDED.cost_basis,
    avg_price  = (p.cost_basis + EXCLUDED.cost_basis) / (p.shares + EXCLUDED.shares),
    status     = 'open',
    settled_at = NULL,
    opened_at  = CASE WHEN p.status = 'closed' THEN now() ELSE p.opened_at END,
    updated_at = now()
  RETURNING p.id INTO v_position_id;

  INSERT INTO trades
    (position_id, user_id, market_id, outcome_id, side, shares, price, usd, realized_pnl)
  VALUES
    (v_position_id, p_user_id, p_market_id, p_outcome_id, 'buy', v_shares, v_avg_price, p_stake, 0)
  RETURNING id INTO v_trade_id;

  UPDATE balances
  SET available  = available - p_stake,
      in_play    = in_play + p_stake,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO balance_transactions
    (user_id, initiated_by, type, amount, balance_after, trade_id, position_id, note)
  VALUES
    (p_user_id, auth.uid(), 'bet_lock', -p_stake, v_balance_after, v_trade_id, v_position_id,
     'Demo bet placed by admin');

  RETURN v_position_id;
END;
$$;

COMMENT ON FUNCTION admin_place_demo_bet(uuid, uuid, uuid, numeric) IS
  'Super-admin demo-bet tool in the positions model: upserts a position + buy trade for the target user using the outcome indicative price (no order-book quote/antifraud). Returns the position id.';
