-- Migration 017: Market settlement logs
-- Adds a dedicated audit table for market settlement events.
-- The settle_market RPC runs as service role (no auth.uid), so it cannot
-- write into admin_action_logs which requires initiated_by → profiles.
-- Instead, we record one row per market settlement here, plus one row per
-- settled bet so that manager / super-admin views can trace every outcome.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. market_settlement_logs  (one row per settled market)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE market_settlement_logs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL    DEFAULT now(),
  market_id            uuid        NOT NULL    REFERENCES markets(id)          ON DELETE CASCADE,
  winning_outcome_id   uuid        NOT NULL    REFERENCES market_outcomes(id)  ON DELETE CASCADE,
  settled_count        int         NOT NULL DEFAULT 0,
  winner_count         int         NOT NULL DEFAULT 0,
  loser_count          int         NOT NULL DEFAULT 0,
  -- NULL = triggered by cron / service role; non-NULL = triggered manually by super_admin
  triggered_by         uuid                    REFERENCES profiles(id)         ON DELETE SET NULL
);

CREATE INDEX idx_msl_market     ON market_settlement_logs(market_id);
CREATE INDEX idx_msl_created_at ON market_settlement_logs(created_at DESC);

ALTER TABLE market_settlement_logs ENABLE ROW LEVEL SECURITY;

-- Super-admin: full read access
CREATE POLICY "super_admin can read settlement logs"
  ON market_settlement_logs FOR SELECT
  USING (is_super_admin());

-- Managers: read logs for markets where they manage at least one affected user
CREATE POLICY "manager can read settlement logs for their users"
  ON market_settlement_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles me
      WHERE me.id = auth.uid()
        AND me.role = 'manager'
    )
    AND EXISTS (
      SELECT 1
      FROM bets b
      JOIN profiles u ON u.id = b.user_id
      WHERE b.market_id = market_settlement_logs.market_id
        AND u.created_by = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. bet_settlement_logs  (one row per settled bet)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE bet_settlement_logs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL    DEFAULT now(),
  market_settlement_id uuid        NOT NULL    REFERENCES market_settlement_logs(id) ON DELETE CASCADE,
  bet_id               uuid        NOT NULL    REFERENCES bets(id)             ON DELETE CASCADE,
  user_id              uuid        NOT NULL    REFERENCES profiles(id)         ON DELETE CASCADE,
  outcome              text        NOT NULL    CHECK (outcome IN ('won', 'lost')),
  stake                numeric(12,2) NOT NULL,
  payout               numeric(12,2) NOT NULL  -- 0 for lost bets
);

CREATE INDEX idx_bsl_market_settlement ON bet_settlement_logs(market_settlement_id);
CREATE INDEX idx_bsl_user              ON bet_settlement_logs(user_id);
CREATE INDEX idx_bsl_bet               ON bet_settlement_logs(bet_id);

ALTER TABLE bet_settlement_logs ENABLE ROW LEVEL SECURITY;

-- Super-admin: full read
CREATE POLICY "super_admin can read bet settlement logs"
  ON bet_settlement_logs FOR SELECT
  USING (is_super_admin());

-- Managers: only their users' bets
CREATE POLICY "manager can read bet settlement logs for their users"
  ON bet_settlement_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles me
      WHERE me.id = auth.uid() AND me.role = 'manager'
    )
    AND EXISTS (
      SELECT 1 FROM profiles u
      WHERE u.id = bet_settlement_logs.user_id
        AND u.created_by = auth.uid()
    )
  );

-- Users: own bets only
CREATE POLICY "user can read own bet settlement logs"
  ON bet_settlement_logs FOR SELECT
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Update settle_market to write into the new log tables
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION settle_market(
  p_market_id          uuid,
  p_winning_outcome_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bet                record;
  v_payout             numeric;
  v_balance_after      numeric;
  v_settled_count      int     := 0;
  v_winner_count       int     := 0;
  v_settlement_log_id  uuid;
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

      UPDATE bets SET status = 'won', settled_at = now() WHERE id = v_bet.id;
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

  -- ── Write market-level settlement log ──────────────────────────────────────
  INSERT INTO market_settlement_logs
    (market_id, winning_outcome_id, settled_count, winner_count, loser_count, triggered_by)
  VALUES
    (p_market_id, p_winning_outcome_id, v_settled_count, v_winner_count,
     v_settled_count - v_winner_count, auth.uid())
  RETURNING id INTO v_settlement_log_id;

  -- ── Write per-bet settlement logs ──────────────────────────────────────────
  INSERT INTO bet_settlement_logs
    (market_settlement_id, bet_id, user_id, outcome, stake, payout)
  SELECT
    v_settlement_log_id,
    b.id,
    b.user_id,
    b.status,  -- 'won' or 'lost' (already updated above)
    b.stake,
    CASE WHEN b.status = 'won' THEN b.stake * b.locked_odds ELSE 0 END
  FROM bets b
  WHERE b.market_id = p_market_id
    AND b.status IN ('won', 'lost')
    AND b.settled_at >= now() - interval '5 seconds';  -- only bets settled in this call

  RETURN jsonb_build_object(
    'settled', v_settled_count,
    'winners', v_winner_count,
    'losers',  v_settled_count - v_winner_count,
    'settlement_log_id', v_settlement_log_id
  );
END;
$$;
