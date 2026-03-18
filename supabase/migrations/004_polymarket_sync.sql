-- Migration 004: Polymarket Sync
-- Adds columns needed for syncing markets from Polymarket Gamma API,
-- default system settings, place_bet and settle_market RPCs,
-- and a unique constraint on market_outcomes for upsert support.

-- ────────────────────────────────────────────────────────────────
-- 1. Extend markets table
-- ────────────────────────────────────────────────────────────────
ALTER TABLE markets ADD COLUMN IF NOT EXISTS is_visible     boolean DEFAULT false NOT NULL;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS liquidity      numeric DEFAULT 0;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS volume         numeric DEFAULT 0;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS image_url      text;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS polymarket_slug text;

-- ────────────────────────────────────────────────────────────────
-- 2. Extend market_outcomes table for token-based upsert
-- ────────────────────────────────────────────────────────────────
ALTER TABLE market_outcomes ADD COLUMN IF NOT EXISTS polymarket_token_id text;

ALTER TABLE market_outcomes
  ADD CONSTRAINT uq_market_outcomes_token
  UNIQUE (market_id, polymarket_token_id);

-- ────────────────────────────────────────────────────────────────
-- 3. Default system settings
-- ────────────────────────────────────────────────────────────────
INSERT INTO system_settings (key, value) VALUES
  ('sync_interval_seconds', '60'),
  ('sync_auto_show_all',    'false')
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- 4. place_bet RPC
--    Called by authenticated users. Deducts stake from available,
--    increases in_play, records a bet_lock transaction, returns bet id.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION place_bet(
  p_market_id  uuid,
  p_outcome_id uuid,
  p_stake      numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_available    numeric;
  v_odds         numeric;
  v_payout       numeric;
  v_bet_id       uuid;
  v_balance_after numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
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

  -- Lock balance row and check funds
  SELECT available INTO v_available
  FROM balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_available IS NULL OR v_available < p_stake THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  v_payout        := p_stake * v_odds;
  v_balance_after := v_available - p_stake;

  -- Create bet record
  INSERT INTO bets (user_id, market_id, outcome_id, stake, locked_odds, potential_payout)
  VALUES (v_user_id, p_market_id, p_outcome_id, p_stake, v_odds, v_payout)
  RETURNING id INTO v_bet_id;

  -- Deduct from available, add to in_play
  UPDATE balances
  SET available  = available - p_stake,
      in_play    = in_play + p_stake,
      updated_at = now()
  WHERE user_id = v_user_id;

  -- Append ledger entry
  INSERT INTO balance_transactions
    (user_id, initiated_by, type, amount, balance_after, bet_id, note)
  VALUES
    (v_user_id, v_user_id, 'bet_lock', -p_stake, v_balance_after, v_bet_id, 'Bet placed');

  RETURN v_bet_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 5. settle_market RPC
--    Called by Edge Function (service role) or Super Admin.
--    Marks market resolved, processes all open bets.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION settle_market(
  p_market_id          uuid,
  p_winning_outcome_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bet           record;
  v_payout        numeric;
  v_balance_after numeric;
  v_settled_count int := 0;
  v_winner_count  int := 0;
BEGIN
  -- Allow service role (uid is NULL) or super_admin only
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
      RAISE EXCEPTION 'Permission denied: only super_admin can settle markets';
    END IF;
  END IF;

  -- Guard: market must exist and not already resolved
  IF NOT EXISTS (
    SELECT 1 FROM markets
    WHERE id = p_market_id AND status != 'resolved'
  ) THEN
    RAISE EXCEPTION 'Market is already resolved or does not exist';
  END IF;

  -- Mark market resolved
  UPDATE markets
  SET status             = 'resolved',
      winning_outcome_id = p_winning_outcome_id,
      resolved_at        = now()
  WHERE id = p_market_id;

  -- Process every open bet on this market
  FOR v_bet IN
    SELECT b.*
    FROM bets b
    WHERE b.market_id = p_market_id AND b.status = 'open'
    FOR UPDATE OF b
  LOOP
    v_settled_count := v_settled_count + 1;

    IF v_bet.outcome_id = p_winning_outcome_id THEN
      -- Winner: return stake × locked odds to available
      v_payout       := v_bet.stake * v_bet.locked_odds;
      v_winner_count := v_winner_count + 1;

      UPDATE balances
      SET available  = available + v_payout,
          in_play    = in_play - v_bet.stake,
          updated_at = now()
      WHERE user_id = v_bet.user_id;

      SELECT available INTO v_balance_after FROM balances WHERE user_id = v_bet.user_id;

      INSERT INTO balance_transactions
        (user_id, initiated_by, type, amount, balance_after, bet_id, note)
      VALUES
        (v_bet.user_id, v_bet.user_id, 'bet_payout', v_payout, v_balance_after, v_bet.id, 'Bet won');

      UPDATE bets SET status = 'won',  settled_at = now() WHERE id = v_bet.id;
    ELSE
      -- Loser: release in_play only, available unchanged
      UPDATE balances
      SET in_play    = in_play - v_bet.stake,
          updated_at = now()
      WHERE user_id = v_bet.user_id;

      SELECT available INTO v_balance_after FROM balances WHERE user_id = v_bet.user_id;

      INSERT INTO balance_transactions
        (user_id, initiated_by, type, amount, balance_after, bet_id, note)
      VALUES
        (v_bet.user_id, v_bet.user_id, 'bet_payout', 0, v_balance_after, v_bet.id, 'Bet lost');

      UPDATE bets SET status = 'lost', settled_at = now() WHERE id = v_bet.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'settled', v_settled_count,
    'winners', v_winner_count,
    'losers',  v_settled_count - v_winner_count
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 6. Performance indexes
-- ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bets_market_status  ON bets(market_id, status);
CREATE INDEX IF NOT EXISTS idx_markets_is_visible  ON markets(is_visible) WHERE is_visible = true;
CREATE INDEX IF NOT EXISTS idx_markets_status      ON markets(status);
