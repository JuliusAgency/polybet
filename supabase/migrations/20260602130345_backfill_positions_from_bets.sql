-- Migration: backfill positions + trades from legacy bets
--
-- One-time conversion of the historical bets table into the new model. On a
-- fresh `db reset` bets is empty (the seed inserts none), so this is a no-op;
-- on prod it converts every pre-trading bet.
--
-- Grouping is by (user_id, outcome_id) — one position per side per user. This
-- is sound because a (user, outcome) group is always uniformly open, won, or
-- lost: settle_market settles ALL of a user's open bets on a market at once, a
-- single outcome resolves one way for everyone, and a closed market accepts no
-- new bets. So open and settled bets never coexist for the same (user, outcome).
--
-- Accounting reconstructed to satisfy the invariant in_play = SUM(cost_basis)
-- over open positions:
--   open  → shares=Σshares, cost_basis=Σstake (still locked in in_play),
--           realized_pnl=0.
--   won   → shares=Σshares (record), cost_basis=0 (already released at settle),
--           realized_pnl=Σshares-Σstake (payout - cost).
--   lost  → shares=Σshares, cost_basis=0, realized_pnl=-Σstake.
-- avg_price is the volume-weighted Σstake/Σshares, clamped to (0,1) defensively
-- (mirrors the clamp in 20260601133330). cancelled bets are excluded.
--
-- One buy trade is emitted per original bet, preserving its own fill price and
-- placed_at, so the trades ledger reproduces the real per-fill history.

DO $$
BEGIN
  -- Idempotency: backfill runs once. If trades already hold rows we are either
  -- re-applying by mistake or the system is already live — skip either way.
  IF EXISTS (SELECT 1 FROM trades) THEN
    RAISE NOTICE 'backfill_positions_from_bets: trades already populated, skipping';
    RETURN;
  END IF;

  -- Data-quality guard: every (user, outcome) group must be uniformly open OR
  -- won OR lost (settle_market settles all of a user's bets on a market at
  -- once, and one outcome resolves one way). If dirty prod data violates this,
  -- fail loudly — the aggregation below would otherwise mis-state cost_basis
  -- and realized_pnl for the mixed group.
  IF EXISTS (
    SELECT 1 FROM bets
    WHERE status IN ('open', 'won', 'lost')
    GROUP BY user_id, outcome_id
    HAVING count(DISTINCT status) > 1
  ) THEN
    RAISE EXCEPTION 'backfill_positions_from_bets: a (user, outcome) has mixed bet statuses; refusing to aggregate';
  END IF;

  -- 1. One position per (user, outcome) aggregating its non-cancelled bets.
  INSERT INTO positions
    (user_id, market_id, outcome_id, shares, avg_price, cost_basis,
     realized_pnl, status, opened_at, updated_at, settled_at)
  SELECT
    b.user_id,
    b.market_id,
    b.outcome_id,
    sum(b.shares)                                                         AS shares,
    least(0.999999, greatest(0.000001, sum(b.stake) / sum(b.shares)))     AS avg_price,
    CASE WHEN bool_or(b.status = 'open') THEN sum(b.stake) ELSE 0 END      AS cost_basis,
    CASE
      WHEN bool_or(b.status = 'open') THEN 0
      WHEN bool_or(b.status = 'won')  THEN sum(b.shares) - sum(b.stake)
      ELSE                                 -sum(b.stake)
    END                                                                   AS realized_pnl,
    CASE
      WHEN bool_or(b.status = 'open') THEN 'open'
      WHEN bool_or(b.status = 'won')  THEN 'won'
      ELSE                                 'lost'
    END                                                                   AS status,
    min(b.placed_at)                                                      AS opened_at,
    now()                                                                 AS updated_at,
    CASE WHEN bool_or(b.status = 'open') THEN NULL ELSE max(b.settled_at) END AS settled_at
  FROM bets b
  WHERE b.status IN ('open', 'won', 'lost')
  -- market_id is functionally dependent on outcome_id (one market per outcome),
  -- so grouping by it does not split groups; it just lets us select it without
  -- an aggregate (Postgres has no min(uuid)).
  GROUP BY b.user_id, b.outcome_id, b.market_id
  ON CONFLICT (user_id, outcome_id) DO NOTHING;

  -- 2. One buy trade per legacy bet, linked to its position.
  INSERT INTO trades
    (position_id, user_id, market_id, outcome_id, side, shares, price, usd, realized_pnl, created_at)
  SELECT
    p.id,
    b.user_id,
    b.market_id,
    b.outcome_id,
    'buy',
    b.shares,
    least(0.999999, greatest(0.000001, b.avg_price)),
    b.stake,
    0,
    b.placed_at
  FROM bets b
  JOIN positions p
    ON p.user_id = b.user_id AND p.outcome_id = b.outcome_id
  WHERE b.status IN ('open', 'won', 'lost');

  RAISE NOTICE 'backfill_positions_from_bets: % positions, % trades',
    (SELECT count(*) FROM positions), (SELECT count(*) FROM trades);
END $$;
