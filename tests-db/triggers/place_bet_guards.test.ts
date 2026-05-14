import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { withTransaction } from '../helpers/pg';

// Regression coverage for migration 20260514091027_place_bet_hard_guards.
//
// place_bet now enforces (in order):
//   1. close_at NOT NULL AND > now()                 [`Market is not available for betting`]
//   2. market.last_synced_at within 3 min            [`Market price feed is stale`]
//   3. price in [0.01, 0.99)                         [`Outcome is untradable (price at floor|ceiling)`]
//   4. effective_odds <= 110                         [`Outcome odds out of bounds`]
//   5. outcome.updated_at within 3 min               [`Outcome price feed is stale`]
//   6. optional drift |expected - actual| / actual <= 2 %  [`Odds changed`, ERRCODE P0002]
//
// Tests authenticate as the seeded user1 (UUID …0003, balance 1000) by
// pinning `request.jwt.claims.sub` inside the transaction. The factory
// helpers seedMarket/seedOutcome don't cover price/staleness/close_at, so
// we use raw SQL with explicit values per test.

const USER1 = '00000000-0000-0000-0000-000000000003';
const FAR_FUTURE = "now() + interval '30 days'";
const FRESH = 'now()';
const STALE = "now() - interval '10 minutes'";

interface MarketSeed {
  status?: 'open' | 'closed' | 'resolved';
  is_visible?: boolean;
  close_at?: string | null; // SQL expression, e.g. FAR_FUTURE; null → NULL
  last_synced_at?: string; // SQL expression
}

interface OutcomeSeed {
  price: number;
  effective_odds: number;
  updated_at?: string; // SQL expression
}

async function seedFreshMarket(
  c: PoolClient,
  market: MarketSeed = {},
  outcome: OutcomeSeed = { price: 0.5, effective_odds: 2 }
): Promise<{ marketId: string; outcomeId: string }> {
  const status = market.status ?? 'open';
  const isVisible = market.is_visible ?? true;
  const closeAtExpr = market.close_at === null ? 'NULL' : (market.close_at ?? FAR_FUTURE);
  const lastSyncedExpr = market.last_synced_at ?? FRESH;
  const outcomeUpdatedExpr = outcome.updated_at ?? FRESH;

  const mk = await c.query<{ id: string }>(
    `INSERT INTO markets (polymarket_id, question, status, is_visible, close_at, last_synced_at)
     VALUES ('pm-pbg-' || gen_random_uuid(), 'q?', $1, $2, ${closeAtExpr}, ${lastSyncedExpr})
     RETURNING id`,
    [status, isVisible]
  );
  const marketId = mk.rows[0].id;

  const mo = await c.query<{ id: string }>(
    `INSERT INTO market_outcomes (market_id, name, price, odds, effective_odds, updated_at)
     VALUES ($1, 'Yes', $2, $3, $4, ${outcomeUpdatedExpr})
     RETURNING id`,
    [marketId, outcome.price, outcome.effective_odds, outcome.effective_odds]
  );

  return { marketId, outcomeId: mo.rows[0].id };
}

async function authAs(c: PoolClient, userId: string): Promise<void> {
  // place_bet reads auth.uid() = (current_setting('request.jwt.claims')::jsonb)->>'sub'.
  // SET LOCAL is a SQL command and rejects placeholders; use set_config(..., true)
  // which accepts parameters and is transaction-local just like SET LOCAL.
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  await c.query(`SELECT set_config('role', 'authenticated', true)`);
}

interface PlaceBetArgs {
  marketId: string;
  outcomeId: string;
  stake?: number;
  expectedOdds?: number | null;
}

async function callPlaceBet(c: PoolClient, args: PlaceBetArgs): Promise<string> {
  // Switch to the authenticated role right before invoking place_bet. Seeding
  // (markets/outcomes/balances) must happen as the test-connection superuser
  // because RLS forbids inserts from authenticated. The role switch is local
  // to the transaction (`set_config(..., true)`) so rollback restores it.
  await authAs(c, USER1);
  const stake = args.stake ?? 10;
  const expected = args.expectedOdds === undefined ? null : args.expectedOdds;
  const res = await c.query<{ place_bet: string }>(
    `SELECT place_bet($1::uuid, $2::uuid, $3::numeric, $4::numeric) AS place_bet`,
    [args.marketId, args.outcomeId, stake, expected]
  );
  return res.rows[0].place_bet;
}

describe('place_bet hard guards (migration 20260514091027)', () => {
  it('rejects when effective_odds exceeds the 110 cap', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        {
          price: 0.5,
          effective_odds: 2000,
        }
      );
      await expect(callPlaceBet(c, { marketId, outcomeId })).rejects.toThrow(/odds out of bounds/i);
    });
  });

  it('rejects when price is at the floor (< 0.01)', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        {
          price: 0.005,
          effective_odds: 50,
        }
      );
      await expect(callPlaceBet(c, { marketId, outcomeId })).rejects.toThrow(/untradable.*floor/i);
    });
  });

  it('rejects when price is at the ceiling (>= 0.99)', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        {
          price: 0.995,
          effective_odds: 1.005,
        }
      );
      await expect(callPlaceBet(c, { marketId, outcomeId })).rejects.toThrow(
        /untradable.*ceiling/i
      );
    });
  });

  it('rejects when both market and outcome have a stale sync timestamp', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        { last_synced_at: STALE },
        { price: 0.5, effective_odds: 2, updated_at: STALE }
      );
      await expect(callPlaceBet(c, { marketId, outcomeId })).rejects.toThrow(
        /Market price feed is stale|Outcome price feed is stale/i
      );
    });
  });

  it('rejects when close_at IS NULL', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(c, { close_at: null });
      await expect(callPlaceBet(c, { marketId, outcomeId })).rejects.toThrow(
        /not available for betting/i
      );
    });
  });

  it('rejects when close_at has already passed', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(c, {
        close_at: "now() - interval '1 minute'",
      });
      await expect(callPlaceBet(c, { marketId, outcomeId })).rejects.toThrow(
        /not available for betting/i
      );
    });
  });

  it('rejects on expected_odds drift > 2%', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        {
          price: 0.5,
          effective_odds: 2.1,
        }
      );
      // Client claims 2.0 → drift 0.1/2.1 ≈ 4.76% (> 2%) → reject.
      await expect(callPlaceBet(c, { marketId, outcomeId, expectedOdds: 2.0 })).rejects.toThrow(
        /Odds changed/i
      );
    });
  });

  it('accepts when expected_odds drift is within 2%', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        {
          price: 0.5,
          effective_odds: 2.01,
        }
      );
      // Drift 0.01/2.01 ≈ 0.5% → accept.
      const betId = await callPlaceBet(c, {
        marketId,
        outcomeId,
        expectedOdds: 2.0,
      });
      expect(betId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('accepts when expected_odds is NULL (legacy client back-compat)', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        {
          price: 0.5,
          effective_odds: 2,
        }
      );
      const betId = await callPlaceBet(c, {
        marketId,
        outcomeId,
        expectedOdds: null,
      });
      expect(betId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('happy path: valid bet creates a row and debits the balance', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        {
          price: 0.4,
          effective_odds: 2.4,
        }
      );
      const before = await c.query<{ available: string }>(
        'SELECT available FROM balances WHERE user_id = $1',
        [USER1]
      );
      const availableBefore = Number(before.rows[0].available);

      const betId = await callPlaceBet(c, {
        marketId,
        outcomeId,
        stake: 25,
        expectedOdds: 2.4,
      });

      const after = await c.query<{ available: string; in_play: string }>(
        'SELECT available, in_play FROM balances WHERE user_id = $1',
        [USER1]
      );
      expect(Number(after.rows[0].available)).toBe(availableBefore - 25);

      const bet = await c.query<{ locked_odds: string; potential_payout: string }>(
        'SELECT locked_odds, potential_payout FROM bets WHERE id = $1',
        [betId]
      );
      expect(Number(bet.rows[0].locked_odds)).toBe(2.4);
      expect(Number(bet.rows[0].potential_payout)).toBe(60);
    });
  });
});
