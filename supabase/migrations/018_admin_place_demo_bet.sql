-- Migration 018: admin_place_demo_bet RPC
-- Allows super_admin to place a bet on behalf of any user from the Test Lab UI.
-- Mirrors the logic of place_bet but uses p_user_id instead of auth.uid().

CREATE OR REPLACE FUNCTION admin_place_demo_bet(
  p_user_id    uuid,
  p_market_id  uuid,
  p_outcome_id uuid,
  p_stake      numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_odds          numeric;
  v_available     numeric;
  v_bet_id        uuid;
  v_balance_after numeric;
BEGIN
  -- Only super_admin may call this
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: only super_admin can place demo bets';
  END IF;

  -- Target user must exist
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Market must be open and visible
  IF NOT EXISTS (
    SELECT 1 FROM markets
    WHERE id = p_market_id AND status = 'open' AND is_visible = true
  ) THEN
    RAISE EXCEPTION 'Market is not available for betting';
  END IF;

  -- Outcome must belong to this market
  SELECT odds INTO v_odds
  FROM market_outcomes
  WHERE id = p_outcome_id AND market_id = p_market_id;

  IF v_odds IS NULL THEN
    RAISE EXCEPTION 'Invalid outcome for this market';
  END IF;

  -- Lock user balance row and check funds
  SELECT available INTO v_available
  FROM balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_available IS NULL OR v_available < p_stake THEN
    RAISE EXCEPTION 'Insufficient balance for user';
  END IF;

  -- Create bet record
  INSERT INTO bets (user_id, market_id, outcome_id, stake, locked_odds, potential_payout)
  VALUES (p_user_id, p_market_id, p_outcome_id, p_stake, v_odds, p_stake * v_odds)
  RETURNING id INTO v_bet_id;

  -- Move stake: available → in_play
  UPDATE balances
  SET available  = available - p_stake,
      in_play    = in_play + p_stake,
      updated_at = now()
  WHERE user_id = p_user_id;

  SELECT available INTO v_balance_after FROM balances WHERE user_id = p_user_id;

  -- Log the transaction
  INSERT INTO balance_transactions
    (user_id, initiated_by, type, amount, balance_after, bet_id, note)
  VALUES
    (p_user_id, auth.uid(), 'bet_stake', -p_stake, v_balance_after, v_bet_id,
     'Demo bet placed by admin');

  RETURN v_bet_id;
END;
$$;
