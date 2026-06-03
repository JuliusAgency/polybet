-- Migration: settle_market settles positions (not bets)
--
-- Resolution now pays out POSITIONS. A winning position's shares each redeem
-- for $1; a losing position's shares are worth $0. The market-level lifecycle
-- logic (permission check, market lock, conflicting-winner reject, the a/b/c
-- resolve-state branches, idempotency on a status='open' loop) is preserved
-- verbatim from 20260601133340 — only the entity being settled changes from
-- bets to positions, and the per-entity log moves to position_settlement_logs.
--
-- Per-position settlement accounting (cost_basis == shares*avg_price holds for
-- every open position, because buys and sells move shares and cost_basis in
-- lockstep):
--   WIN  → available += shares; in_play -= cost_basis;
--          realized_pnl += shares - cost_basis; cost_basis = 0; status='won'.
--   LOSE → in_play -= cost_basis;
--          realized_pnl -= cost_basis;          cost_basis = 0; status='lost'.
-- Ledger: one bet_payout row per position (amount = shares on win, 0 on loss),
-- keyed on position_id for the re-entry guard (uq_balance_transactions_position_payout).
--
-- Legacy bets are NOT touched — they are frozen historical data, already
-- mirrored into positions by the backfill. Their settle path is fully retired.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. position_settlement_logs — per-position audit, parallel to bet_settlement_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE position_settlement_logs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  market_settlement_id uuid        NOT NULL REFERENCES market_settlement_logs(id) ON DELETE CASCADE,
  position_id          uuid        NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  user_id              uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  outcome              text        NOT NULL CHECK (outcome IN ('won', 'lost')),
  -- Cost basis settled (= shares*avg_price at resolution), shares redeemed, the
  -- $1-per-share payout (0 for losers), and the realized P/L this settlement
  -- crystallized (payout - cost_basis).
  cost_basis           numeric     NOT NULL,
  shares               numeric     NOT NULL,
  payout               numeric     NOT NULL,
  realized_pnl         numeric     NOT NULL,
  -- A position settles exactly once; this also backs the ON CONFLICT dedupe.
  CONSTRAINT position_settlement_logs_position_unique UNIQUE (position_id)
);

CREATE INDEX idx_psl_market_settlement ON position_settlement_logs(market_settlement_id);
CREATE INDEX idx_psl_user              ON position_settlement_logs(user_id);

ALTER TABLE position_settlement_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own position settlement logs"
  ON position_settlement_logs FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "Managers read linked position settlement logs"
  ON position_settlement_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM manager_user_links mul
      JOIN profiles mp ON mp.id = mul.manager_id
      WHERE mul.user_id = position_settlement_logs.user_id
        AND mul.manager_id = (select auth.uid())
        AND mp.role = 'manager'
    )
  );

CREATE POLICY "Super admin reads all position settlement logs"
  ON position_settlement_logs FOR SELECT
  USING (is_super_admin());

GRANT SELECT ON position_settlement_logs TO authenticated;
-- Defense in depth: RLS has no write policy, but make the absence of write
-- access explicit so default schema ACLs cannot grant it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON position_settlement_logs FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. settle_market — settle open positions for the resolved market
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION settle_market(
  p_market_id          uuid,
  p_winning_outcome_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_pos                record;
  v_payout             numeric;
  v_balance_after      numeric;
  v_settled_count      int     := 0;
  v_winner_count       int     := 0;
  v_settlement_log_id  uuid    := null;
  v_settled_ids        uuid[]  := '{}';
  v_market             record;
BEGIN
  -- Allow service role (uid is NULL) or super_admin only.
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
      RAISE EXCEPTION 'Permission denied: only super_admin can settle markets';
    END IF;
  END IF;

  -- Lock market row to serialize concurrent settlement attempts.
  SELECT id, status, winning_outcome_id
  INTO v_market
  FROM markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF v_market.id IS NULL THEN
    RAISE EXCEPTION 'Market does not exist';
  END IF;

  -- Reject a conflicting winner on an already-resolved market (data-integrity
  -- issue, not idempotency).
  IF v_market.winning_outcome_id IS NOT NULL
     AND v_market.winning_outcome_id <> p_winning_outcome_id THEN
    RAISE EXCEPTION 'Market already resolved with a different winning_outcome_id';
  END IF;

  -- Bring the market to a fully-resolved state (branches a/b/c from migration 067).
  IF v_market.status NOT IN ('resolved', 'archived') THEN
    UPDATE markets
    SET status             = 'resolved',
        winning_outcome_id = p_winning_outcome_id,
        resolved_at        = now()
    WHERE id = p_market_id;
  ELSIF v_market.winning_outcome_id IS NULL THEN
    UPDATE markets
    SET winning_outcome_id = p_winning_outcome_id,
        resolved_at        = COALESCE(resolved_at, now())
    WHERE id = p_market_id;
  END IF;

  -- Process every open position on this market. Idempotent: a re-entry whose
  -- positions are already won/lost runs the loop zero times.
  FOR v_pos IN
    SELECT p.*
    FROM positions p
    WHERE p.market_id = p_market_id AND p.status = 'open'
    FOR UPDATE OF p
  LOOP
    v_settled_count := v_settled_count + 1;
    v_settled_ids   := array_append(v_settled_ids, v_pos.id);

    IF v_pos.outcome_id = p_winning_outcome_id THEN
      -- Winner: each share redeems for $1.
      v_payout       := v_pos.shares;
      v_winner_count := v_winner_count + 1;

      UPDATE balances
      SET available  = available + v_payout,
          in_play    = in_play - v_pos.cost_basis,
          updated_at = now()
      WHERE user_id = v_pos.user_id;

      SELECT available INTO v_balance_after FROM balances WHERE user_id = v_pos.user_id;

      INSERT INTO balance_transactions
        (user_id, initiated_by, type, amount, balance_after, position_id, note)
      VALUES
        (v_pos.user_id, v_pos.user_id, 'bet_payout', v_payout, v_balance_after, v_pos.id, 'Position won')
      ON CONFLICT (position_id) WHERE type = 'bet_payout' AND position_id IS NOT NULL
      DO NOTHING;

      UPDATE positions
      SET status       = 'won',
          settled_at   = now(),
          realized_pnl = realized_pnl + (v_pos.shares - v_pos.cost_basis),
          cost_basis   = 0,
          updated_at   = now()
      WHERE id = v_pos.id;
    ELSE
      -- Loser: shares worth $0; release the locked cost basis from in_play.
      UPDATE balances
      SET in_play    = in_play - v_pos.cost_basis,
          updated_at = now()
      WHERE user_id = v_pos.user_id;

      SELECT available INTO v_balance_after FROM balances WHERE user_id = v_pos.user_id;

      INSERT INTO balance_transactions
        (user_id, initiated_by, type, amount, balance_after, position_id, note)
      VALUES
        (v_pos.user_id, v_pos.user_id, 'bet_payout', 0, v_balance_after, v_pos.id, 'Position lost')
      ON CONFLICT (position_id) WHERE type = 'bet_payout' AND position_id IS NOT NULL
      DO NOTHING;

      UPDATE positions
      SET status       = 'lost',
          settled_at   = now(),
          realized_pnl = realized_pnl - v_pos.cost_basis,
          cost_basis   = 0,
          updated_at   = now()
      WHERE id = v_pos.id;
    END IF;
  END LOOP;

  IF v_settled_count > 0 THEN
    INSERT INTO market_settlement_logs
      (market_id, winning_outcome_id, settled_count, winner_count, loser_count, triggered_by)
    VALUES
      (p_market_id, p_winning_outcome_id, v_settled_count, v_winner_count, v_settled_count - v_winner_count, auth.uid())
    RETURNING id INTO v_settlement_log_id;

    -- Per-position log over EXACTLY the positions settled in this call
    -- (v_settled_ids), not a fragile time window. cost_basis was zeroed above,
    -- but shares and avg_price are preserved, so settled cost = shares*avg_price.
    INSERT INTO position_settlement_logs
      (market_settlement_id, position_id, user_id, outcome, cost_basis, shares, payout, realized_pnl)
    SELECT
      v_settlement_log_id,
      p.id,
      p.user_id,
      p.status,
      p.shares * p.avg_price                                                      AS cost_basis,
      p.shares                                                                    AS shares,
      CASE WHEN p.status = 'won' THEN p.shares ELSE 0 END                         AS payout,
      (CASE WHEN p.status = 'won' THEN p.shares ELSE 0 END) - p.shares * p.avg_price AS realized_pnl
    FROM positions p
    WHERE p.id = ANY(v_settled_ids)
    ON CONFLICT (position_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'settled', v_settled_count,
    'winners', v_winner_count,
    'losers',  v_settled_count - v_winner_count,
    'already_settled', (v_settled_count = 0),
    'settlement_log_id', v_settlement_log_id
  );
END;
$$;

COMMENT ON FUNCTION settle_market(uuid, uuid) IS
  'Idempotent on positions (not market status). Settles open positions for the market: winners get shares*$1 to available and release cost_basis from in_play; losers release cost_basis. Writes market_settlement_logs + position_settlement_logs. Accepts already-resolved markets and settles remaining open positions when the supplied winner matches the stored one (or stored is NULL).';
