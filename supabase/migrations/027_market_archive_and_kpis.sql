-- Migration 027: Market archive lifecycle, idempotent settlement guards, and KPI views

-- 1) Extend market status lifecycle with archived state
ALTER TABLE markets DROP CONSTRAINT IF EXISTS markets_status_check;
ALTER TABLE markets
  ADD CONSTRAINT markets_status_check
  CHECK (status IN ('open', 'closed', 'resolved', 'archived'));

-- 2) Archive lifecycle config
INSERT INTO system_settings (key, value)
VALUES ('archive_after_hours', '168')
ON CONFLICT (key) DO NOTHING;

-- 3) Prevent duplicate settlement logs and duplicate bet-related ledger rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_bet_settlement_logs_bet_id
  ON bet_settlement_logs (bet_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_balance_transactions_bet_lock
  ON balance_transactions (bet_id)
  WHERE type = 'bet_lock' AND bet_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_balance_transactions_bet_payout
  ON balance_transactions (bet_id)
  WHERE type = 'bet_payout' AND bet_id IS NOT NULL;

-- 4) Idempotent settle_market
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
  v_settlement_log_id  uuid    := null;
  v_market_status      text;
BEGIN
  -- Allow service role (uid is NULL) or super_admin only
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
      RAISE EXCEPTION 'Permission denied: only super_admin can settle markets';
    END IF;
  END IF;

  -- Lock market row to serialize concurrent settlement attempts
  SELECT status
  INTO v_market_status
  FROM markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF v_market_status IS NULL THEN
    RAISE EXCEPTION 'Market does not exist';
  END IF;

  -- Idempotent: already terminal
  IF v_market_status IN ('resolved', 'archived') THEN
    RETURN jsonb_build_object(
      'settled', 0,
      'winners', 0,
      'losers', 0,
      'already_settled', true,
      'settlement_log_id', null
    );
  END IF;

  -- Mark market resolved
  UPDATE markets
  SET status             = 'resolved',
      winning_outcome_id = p_winning_outcome_id,
      resolved_at        = now()
  WHERE id = p_market_id;

  -- Process all currently open bets on this market
  FOR v_bet IN
    SELECT b.*
    FROM bets b
    WHERE b.market_id = p_market_id AND b.status = 'open'
    FOR UPDATE OF b
  LOOP
    v_settled_count := v_settled_count + 1;

    IF v_bet.outcome_id = p_winning_outcome_id THEN
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
        (v_bet.user_id, v_bet.user_id, 'bet_payout', v_payout, v_balance_after, v_bet.id, 'Bet won')
      ON CONFLICT DO NOTHING;

      UPDATE bets SET status = 'won', settled_at = now() WHERE id = v_bet.id;
    ELSE
      UPDATE balances
      SET in_play    = in_play - v_bet.stake,
          updated_at = now()
      WHERE user_id = v_bet.user_id;

      SELECT available INTO v_balance_after FROM balances WHERE user_id = v_bet.user_id;

      INSERT INTO balance_transactions
        (user_id, initiated_by, type, amount, balance_after, bet_id, note)
      VALUES
        (v_bet.user_id, v_bet.user_id, 'bet_payout', 0, v_balance_after, v_bet.id, 'Bet lost')
      ON CONFLICT DO NOTHING;

      UPDATE bets SET status = 'lost', settled_at = now() WHERE id = v_bet.id;
    END IF;
  END LOOP;

  IF v_settled_count > 0 THEN
    INSERT INTO market_settlement_logs
      (market_id, winning_outcome_id, settled_count, winner_count, loser_count, triggered_by)
    VALUES
      (p_market_id, p_winning_outcome_id, v_settled_count, v_winner_count, v_settled_count - v_winner_count, auth.uid())
    RETURNING id INTO v_settlement_log_id;

    INSERT INTO bet_settlement_logs
      (market_settlement_id, bet_id, user_id, outcome, stake, payout)
    SELECT
      v_settlement_log_id,
      b.id,
      b.user_id,
      b.status,
      b.stake,
      CASE WHEN b.status = 'won' THEN b.stake * b.locked_odds ELSE 0 END
    FROM bets b
    WHERE b.market_id = p_market_id
      AND b.status IN ('won', 'lost')
      AND b.settled_at >= now() - interval '5 seconds'
    ON CONFLICT (bet_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'settled', v_settled_count,
    'winners', v_winner_count,
    'losers',  v_settled_count - v_winner_count,
    'already_settled', false,
    'settlement_log_id', v_settlement_log_id
  );
END;
$$;

-- 5) System-wide KPI snapshot (single-row view)
CREATE OR REPLACE VIEW system_kpis AS
SELECT
  COALESCE((
    SELECT SUM(b.available + b.in_play)
    FROM balances b
  ), 0)::numeric AS total_points_in_system,
  COALESCE((
    SELECT SUM(GREATEST(bt.potential_payout - bt.stake, 0))
    FROM bets bt
    WHERE bt.status = 'open'
  ), 0)::numeric AS open_exposure,
  COALESCE((
    SELECT SUM(
      CASE
        WHEN bt.status = 'won' THEN bt.stake - bt.potential_payout
        WHEN bt.status = 'lost' THEN bt.stake
        ELSE 0
      END
    )
    FROM bets bt
  ), 0)::numeric AS system_profit,
  (SELECT COUNT(*) FROM markets WHERE status = 'open')::bigint AS active_markets,
  (SELECT COUNT(*) FROM markets WHERE status = 'resolved')::bigint AS resolved_markets,
  (SELECT COUNT(*) FROM markets WHERE status = 'archived')::bigint AS archived_markets,
  (SELECT COUNT(*) FROM profiles WHERE role = 'manager')::bigint AS total_managers,
  (SELECT COUNT(*) FROM profiles WHERE role = 'user')::bigint AS total_users;

-- 6) Manager group metrics snapshot (one row per manager)
CREATE OR REPLACE VIEW manager_group_metrics AS
SELECT
  p.id AS manager_id,
  p.username AS manager_username,
  p.full_name AS manager_full_name,
  COALESCE(SUM(CASE WHEN b.status = 'open' THEN GREATEST(b.potential_payout - b.stake, 0) ELSE 0 END), 0)::numeric AS group_open_exposure,
  COALESCE(SUM(CASE
    WHEN b.status = 'won' THEN b.stake - b.potential_payout
    WHEN b.status = 'lost' THEN b.stake
    ELSE 0
  END), 0)::numeric AS group_pnl,
  COALESCE(SUM(b.stake), 0)::numeric AS group_turnover
FROM profiles p
LEFT JOIN manager_user_links mul ON mul.manager_id = p.id
LEFT JOIN bets b ON b.user_id = mul.user_id
WHERE p.role = 'manager'
GROUP BY p.id, p.username, p.full_name;
