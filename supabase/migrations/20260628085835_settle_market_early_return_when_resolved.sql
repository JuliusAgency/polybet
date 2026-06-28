-- Incident fix (2026-06-28) — Tier 1a: settle_market early-return on already-settled markets.
--
-- Context: the market-tracker (services/market-tracker) re-invokes
-- settle_market_by_token -> settle_market for EVERY closed/resolved market on
-- every crawl tick (batchWriter.ts upsertEventsBatch Phase 6 + upsertMarketFromGamma),
-- with no "already settled in our DB" guard. In production this reached ~52M
-- calls. settle_market acquired `SELECT ... FOR UPDATE` on the market row BEFORE
-- determining there was nothing to do, so each no-op call still wrote a tuple
-- lock to WAL (~308 GB cumulative) and contended with concurrent
-- bulk_upsert_markets updates on the same rows -> ShareLock deadlocks + statement
-- timeouts on a throttled (disk-IO burst-exhausted) instance.
--
-- Fix: a lock-free fast path. If the market is already resolved/archived WITH a
-- winner recorded, return immediately without taking FOR UPDATE. Every genuine
-- settlement still falls through to the original locking logic, unchanged:
--   * market does not exist                      -> same exception (both paths)
--   * resolved/archived + same winner            -> fast no-op return  (NEW)
--   * resolved/archived + DIFFERENT winner        -> same data-integrity exception
--   * resolved/archived + winner NULL (stranded) -> falls through, backfills winner
--   * not yet terminal                            -> falls through, settles normally
--
-- Idempotent (CREATE OR REPLACE) — safe to re-apply.

CREATE OR REPLACE FUNCTION public.settle_market(p_market_id uuid, p_winning_outcome_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- ── Fast path (incident fix 2026-06-28) ──────────────────────────────────
  -- Lock-free pre-read. The market-tracker re-calls settle on every
  -- closed/resolved market each crawl tick (~52M calls in prod); the FOR UPDATE
  -- below writes a tuple lock to WAL and contends with bulk_upsert_markets even
  -- when there is nothing to settle. Short-circuit that no-op case here. Any
  -- genuine settlement (not yet terminal, or winner not yet backfilled) falls
  -- through to the original FOR UPDATE path below, unchanged.
  SELECT id, status, winning_outcome_id
  INTO v_market
  FROM markets
  WHERE id = p_market_id;

  IF v_market.id IS NULL THEN
    RAISE EXCEPTION 'Market does not exist';
  END IF;

  IF v_market.status IN ('resolved', 'archived')
     AND v_market.winning_outcome_id IS NOT NULL THEN
    IF v_market.winning_outcome_id <> p_winning_outcome_id THEN
      RAISE EXCEPTION 'Market already resolved with a different winning_outcome_id';
    END IF;
    RETURN jsonb_build_object(
      'settled',           0,
      'winners',           0,
      'losers',            0,
      'already_settled',   true,
      'settlement_log_id', null
    );
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
$function$;
