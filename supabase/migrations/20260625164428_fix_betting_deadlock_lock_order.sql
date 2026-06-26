-- Fix betting deadlocks: enforce a consistent row-lock acquisition order.
--
-- SYMPTOM (prod Postgres logs, 2026-06-25): recurring "deadlock detected" plus
-- multi-second ShareLock waits on the betting path, intermittently failing
-- place_bet / sell_position under load.
--
-- ROOT CAUSE: settle_market holds markets(M) FOR UPDATE and then settles every
-- open position on the market, UPDATE-locking each holder's balances row inside
-- the loop. The loop had NO ORDER BY, so it locked positions — and therefore the
-- per-user balances rows — in an arbitrary, index/cache-dependent order. Two
-- settlements running on DIFFERENT markets that share users (or a settlement vs.
-- another multi-row locker) could acquire the same balances rows in OPPOSITE
-- orders → classic AB/BA deadlock. The single-row lockers (place_bet,
-- sell_position) each lock exactly one balances row, so the multi-row locker
-- (settle_market) is where a consistent order must be imposed.
--
-- FIX 1 — settle_market: order the settlement loop by (user_id, id). This makes
-- both the positions row locks AND the subsequent per-user balances UPDATE locks
-- acquire in a single, globally consistent order, so concurrent settlements can
-- no longer form a lock cycle. Behaviour is otherwise byte-for-byte identical to
-- 20260602131002 (idempotent on open positions, same payout accounting + logs).
--
-- FIX 2 — admin_place_demo_bet: take the markets row FOR UPDATE (instead of a
-- non-locking EXISTS check) BEFORE locking balances/positions, matching
-- place_bet's market → balances → positions order. This keeps the super-admin
-- demo tool from inverting lock acquisition against a concurrent real bet.
-- Otherwise identical to 20260603070324.
--
-- The application also retries the loser of a deadlock (SQLSTATE 40P01) on the
-- client (usePlaceBet / useSellPosition), so a rare residual race is transparent
-- to the user. CREATE OR REPLACE preserves each function's existing ACL.

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1: settle_market — settle open positions in a consistent (user_id, id) lock order
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
  --
  -- ORDER BY (user_id, id) is the deadlock fix: it locks positions and, via the
  -- per-holder balances UPDATEs below, the balances rows in one globally
  -- consistent order, so two settlements over overlapping users can never form a
  -- lock cycle. (Was unordered in 20260602131002.)
  FOR v_pos IN
    SELECT p.*
    FROM positions p
    WHERE p.market_id = p_market_id AND p.status = 'open'
    ORDER BY p.user_id, p.id
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
  'Idempotent on positions (not market status). Settles open positions for the market: winners get shares*$1 to available and release cost_basis from in_play; losers release cost_basis. Writes market_settlement_logs + position_settlement_logs. Settlement loop is ORDER BY (user_id, id) for a consistent global lock order (deadlock fix, 20260625164428). Accepts already-resolved markets and settles remaining open positions when the supplied winner matches the stored one (or stored is NULL).';

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 2: admin_place_demo_bet — lock the markets row first (match place_bet order)
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- Market must be open (visibility not required for admin). Lock the row FOR
  -- UPDATE — matching place_bet's lock order (markets -> balances -> positions) so
  -- the demo tool can't invert lock acquisition against a concurrent real bet
  -- (deadlock fix, 20260625164428). Was a non-locking EXISTS check.
  PERFORM 1 FROM markets WHERE id = p_market_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN
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
  'Super-admin demo-bet tool in the positions model: upserts a position + buy trade for the target user using the outcome indicative price (no order-book quote/antifraud). Locks the markets row FOR UPDATE first to match place_bet''s lock order (deadlock fix, 20260625164428). Returns the position id.';
