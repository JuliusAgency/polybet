-- Migration: place_bet hard guards (price bounds, odds cap, freshness, drift, close_at NOT NULL)
--
-- Background: a user could place a bet at locked_odds = 2000 on an outcome whose
-- real Polymarket price had collapsed near 0, because place_bet trusted
-- market_outcomes.effective_odds blindly. priceToOdds in both sync runtimes
-- floors price at 0.01 (so legitimate max odds = 100), but stale or legacy
-- rows can carry effective_odds far above that. Settlement multiplies stake
-- by locked_odds, so a 100-stake bet could mint a 199 900 payout.
--
-- This migration:
--   1. Replaces place_bet with hard guards: price in [0.01, 0.99), odds <= 110,
--      both market.last_synced_at AND outcome.updated_at within 3 minutes,
--      close_at NOT NULL AND > now(), and optional expected_odds drift <= 2%.
--   2. Voids the 2 pre-existing open bets with locked_odds > 110 (refunds stake
--      to available, releases in_play, writes an adjustment ledger entry).
--
-- New signature: p_expected_odds is appended as DEFAULT NULL so existing
-- frontend (which sends 3 args) keeps working — only the new client passes
-- expected odds and gets the drift guard.

CREATE OR REPLACE FUNCTION place_bet(
  p_market_id      uuid,
  p_outcome_id     uuid,
  p_stake          numeric,
  p_expected_odds  numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  c_min_price            CONSTANT numeric  := 0.01;
  c_max_price            CONSTANT numeric  := 0.99;
  c_max_odds             CONSTANT numeric  := 110;
  c_max_staleness        CONSTANT interval := interval '3 minutes';
  c_odds_drift_tolerance CONSTANT numeric  := 0.02;

  v_user_id         uuid := auth.uid();
  v_available       numeric;
  v_effective_odds  numeric;
  v_price           numeric;
  v_outcome_updated timestamptz;
  v_market_synced   timestamptz;
  v_market_created  timestamptz;
  v_payout          numeric;
  v_bet_id          uuid;
  v_balance_after   numeric;
  v_limit           numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Effective max bet limit hierarchy (global > manager > user)
  SELECT effective_limit
  INTO v_limit
  FROM resolve_effective_max_bet_limit(v_user_id);

  IF v_limit IS NOT NULL AND p_stake > v_limit THEN
    RAISE EXCEPTION 'Stake exceeds effective maximum bet limit';
  END IF;

  -- Lock the market row to serialize concurrent bets on the same market.
  SELECT last_synced_at, created_at
  INTO v_market_synced, v_market_created
  FROM markets
  WHERE id = p_market_id
    AND status = 'open'
    AND is_visible = true
    AND close_at IS NOT NULL
    AND close_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    -- The market is either not open, not visible, or has no/expired close_at.
    -- A NULL close_at on an open market is treated as a sync defect: refuse.
    RAISE EXCEPTION 'Market is not available for betting';
  END IF;

  -- Market price feed freshness. Allow NULL last_synced_at only for markets
  -- created in the past few minutes (initial-seed grace).
  IF v_market_synced IS NULL THEN
    IF v_market_created IS NULL OR v_market_created < now() - c_max_staleness THEN
      RAISE EXCEPTION 'Market price feed is stale';
    END IF;
  ELSIF v_market_synced < now() - c_max_staleness THEN
    RAISE EXCEPTION 'Market price feed is stale';
  END IF;

  -- Outcome read & validate.
  SELECT effective_odds, price, updated_at
  INTO v_effective_odds, v_price, v_outcome_updated
  FROM market_outcomes
  WHERE id = p_outcome_id AND market_id = p_market_id;

  IF v_effective_odds IS NULL THEN
    RAISE EXCEPTION 'Invalid outcome for this market';
  END IF;

  -- Price bounds: floor protects against suicide-side bets; ceiling is a
  -- symmetric sanity check that catches both data corruption and the
  -- pathological "stake $100 to win 1¢" case.
  IF v_price IS NULL OR v_price < c_min_price THEN
    RAISE EXCEPTION 'Outcome is untradable (price at floor)';
  END IF;

  IF v_price >= c_max_price THEN
    RAISE EXCEPTION 'Outcome is untradable (price at ceiling)';
  END IF;

  -- Odds cap: catch-all for legacy/stale effective_odds rows that escaped
  -- the priceToOdds floor in either sync runtime. With min_price=0.01 the
  -- real ceiling is 100; 110 leaves headroom for house-margin variants.
  IF v_effective_odds > c_max_odds THEN
    RAISE EXCEPTION 'Outcome odds out of bounds';
  END IF;

  IF v_outcome_updated IS NULL OR v_outcome_updated < now() - c_max_staleness THEN
    RAISE EXCEPTION 'Outcome price feed is stale';
  END IF;

  -- Optimistic-concurrency drift guard. Only enforced when the client opted
  -- in by sending its observed odds. ERRCODE P0002 lets the client render a
  -- structured "odds changed" retry UI instead of a generic failure.
  IF p_expected_odds IS NOT NULL THEN
    IF abs(p_expected_odds - v_effective_odds) / v_effective_odds > c_odds_drift_tolerance THEN
      RAISE EXCEPTION 'Odds changed (expected %, actual %)',
        p_expected_odds, v_effective_odds
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

  v_payout        := p_stake * v_effective_odds;
  v_balance_after := v_available - p_stake;

  INSERT INTO bets (user_id, market_id, outcome_id, stake, locked_odds, potential_payout)
  VALUES (v_user_id, p_market_id, p_outcome_id, p_stake, v_effective_odds, v_payout)
  RETURNING id INTO v_bet_id;

  UPDATE balances
  SET available  = available - p_stake,
      in_play    = in_play + p_stake,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO balance_transactions
    (user_id, initiated_by, type, amount, balance_after, bet_id, note)
  VALUES
    (v_user_id, v_user_id, 'bet_lock', -p_stake, v_balance_after, v_bet_id, 'Bet placed');

  RETURN v_bet_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- One-off cleanup: void the 2 known legacy open bets with locked_odds > 110.
-- Audited beforehand (placed_at 2026-04-25 and 2026-05-05, both test user
-- 00000000-0000-0000-0000-000000000003, stake $1 each, total exposure $952).
-- Refunds stake to available, releases in_play, marks status='cancelled',
-- appends an adjustment ledger entry. Idempotent: the WHERE clause filters
-- on the current state, so re-running is a no-op.
-- ────────────────────────────────────────────────────────────────────────
DO $cleanup$
DECLARE
  r RECORD;
  v_balance_after numeric;
BEGIN
  FOR r IN
    SELECT id, user_id, stake
    FROM bets
    WHERE status = 'open' AND locked_odds > 110
    FOR UPDATE
  LOOP
    UPDATE balances
    SET available  = available + r.stake,
        in_play    = in_play - r.stake,
        updated_at = now()
    WHERE user_id = r.user_id
    RETURNING available INTO v_balance_after;

    UPDATE bets
    SET status     = 'cancelled',
        settled_at = now()
    WHERE id = r.id;

    INSERT INTO balance_transactions
      (user_id, initiated_by, type, amount, balance_after, bet_id, note)
    VALUES
      (r.user_id, r.user_id, 'adjustment', r.stake, v_balance_after, r.id,
       'Voided: locked_odds exceeded post-fix cap (legacy stale price)');
  END LOOP;
END;
$cleanup$;
