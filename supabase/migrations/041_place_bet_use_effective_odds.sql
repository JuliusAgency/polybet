-- Migration 041: Fix place_bet to lock effective_odds instead of raw odds
--
-- Bug: place_bet was reading market_outcomes.odds (raw Polymarket price) for
-- payout calculation, while BetSlip displayed effective_odds (house-margined).
-- This caused winners to receive more than shown — the manager margin was lost.
--
-- Fix: lock effective_odds at bet time, store it in locked_odds, and use it
-- for both potential_payout and settle_market payout.

CREATE OR REPLACE FUNCTION place_bet(
  p_market_id  uuid,
  p_outcome_id uuid,
  p_stake      numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id         uuid := auth.uid();
  v_available       numeric;
  v_effective_odds  numeric;
  v_payout          numeric;
  v_bet_id          uuid;
  v_balance_after   numeric;
  v_limit           numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Resolve and enforce max bet limit hierarchy (global > manager > user)
  SELECT effective_limit
  INTO v_limit
  FROM resolve_effective_max_bet_limit(v_user_id);

  IF v_limit IS NOT NULL AND p_stake > v_limit THEN
    RAISE EXCEPTION 'Stake exceeds effective maximum bet limit';
  END IF;

  -- Market must be open and visible
  IF NOT EXISTS (
    SELECT 1 FROM markets
    WHERE id = p_market_id AND status = 'open' AND is_visible = true
  ) THEN
    RAISE EXCEPTION 'Market is not available for betting';
  END IF;

  -- Read effective_odds (house-margined) — this is what was shown to the user
  SELECT effective_odds INTO v_effective_odds
  FROM market_outcomes
  WHERE id = p_outcome_id AND market_id = p_market_id;

  IF v_effective_odds IS NULL THEN
    RAISE EXCEPTION 'Invalid outcome for this market';
  END IF;

  -- Lock balance row to prevent double-spend
  SELECT available INTO v_available
  FROM balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_available IS NULL OR v_available < p_stake THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  v_payout        := p_stake * v_effective_odds;
  v_balance_after := v_available - p_stake;

  -- Create bet with effective_odds locked in
  INSERT INTO bets (user_id, market_id, outcome_id, stake, locked_odds, potential_payout)
  VALUES (v_user_id, p_market_id, p_outcome_id, p_stake, v_effective_odds, v_payout)
  RETURNING id INTO v_bet_id;

  -- Deduct from available, add to in_play
  UPDATE balances
  SET available  = available - p_stake,
      in_play    = in_play + p_stake,
      updated_at = now()
  WHERE user_id = v_user_id;

  -- Append immutable ledger entry
  INSERT INTO balance_transactions
    (user_id, initiated_by, type, amount, balance_after, bet_id, note)
  VALUES
    (v_user_id, v_user_id, 'bet_lock', -p_stake, v_balance_after, v_bet_id, 'Bet placed');

  RETURN v_bet_id;
END;
$$;
