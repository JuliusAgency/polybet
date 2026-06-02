import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { withTransaction } from '../helpers/pg';

// Coverage for place_bet in the SHARES model (migration
// 20260601133349_place_bet_require_book_shares). A bet now REQUIRES a fresh,
// non-partial order-book quote — there is no mid-price fallback.
//
// place_bet enforces (in order):
//   1. stake > 0, effective bet limit
//   2. market open/visible/close_at NOT NULL AND > now()  [`not available for betting`]
//   3. market.last_synced_at within 3 min                 [`Market price feed is stale`]
//   4. outcome has polymarket_token_id                    [`not tradable (no Polymarket token)`]
//   5. price not null, not exact 0/1                      [`out of tradable range`]
//   6. effective_odds <= 1000                             [`Outcome odds out of bounds`]
//   7. outcome.updated_at within 3 min                    [`Outcome price feed is stale`]
//   8. book present (book_updated_at NOT NULL)            [`Market book unavailable`]
//   9. book fresh (<= 5s)                                 [`Market book is stale`]
//  10. book non-partial AND shares > 0                    [`Insufficient liquidity`]
//  11. optional drift |expected - bookEffOdds|/bookEffOdds <= 2%  [`Odds changed`, P0002]
//
// On success the bet stores shares + avg_price (and DEPRECATED mirrors
// locked_odds = shares/stake, potential_payout = shares).

const USER1 = '00000000-0000-0000-0000-000000000003';
const FAR_FUTURE = "now() + interval '30 days'";
const FRESH = 'now()';
const STALE = "now() - interval '10 minutes'";
const STALE_BOOK = "now() - interval '30 seconds'";

interface MarketSeed {
  status?: 'open' | 'closed' | 'resolved';
  is_visible?: boolean;
  close_at?: string | null; // SQL expression; null → NULL
  last_synced_at?: string; // SQL expression
}

interface OutcomeSeed {
  price: number;
  effective_odds: number;
  updated_at?: string; // SQL expression
}

interface BookSeed {
  /** Omit the book row entirely → place_bet rejects with 'Market book unavailable'. */
  omit?: boolean;
  /** book_updated_at SQL expression. Default FRESH. */
  updated_at?: string;
  /** Ask levels [price, size]. Default: one deep level at the outcome price. */
  asks?: Array<[number, number]>;
}

async function seedFreshMarket(
  c: PoolClient,
  market: MarketSeed = {},
  outcome: OutcomeSeed = { price: 0.5, effective_odds: 2 },
  book: BookSeed = {}
): Promise<{ marketId: string; outcomeId: string; tokenId: string }> {
  const status = market.status ?? 'open';
  const isVisible = market.is_visible ?? true;
  const closeAtExpr = market.close_at === null ? 'NULL' : (market.close_at ?? FAR_FUTURE);
  const lastSyncedExpr = market.last_synced_at ?? FRESH;
  const outcomeUpdatedExpr = outcome.updated_at ?? FRESH;
  const tokenId = `tok-${crypto.randomUUID()}`;

  const mk = await c.query<{ id: string }>(
    `INSERT INTO markets (polymarket_id, question, status, is_visible, close_at, last_synced_at)
     VALUES ('pm-pbg-' || gen_random_uuid(), 'q?', $1, $2, ${closeAtExpr}, ${lastSyncedExpr})
     RETURNING id`,
    [status, isVisible]
  );
  const marketId = mk.rows[0].id;

  const mo = await c.query<{ id: string }>(
    `INSERT INTO market_outcomes (market_id, name, price, odds, effective_odds, updated_at, polymarket_token_id)
     VALUES ($1, 'Yes', $2, $3, $4, ${outcomeUpdatedExpr}, $5)
     RETURNING id`,
    [marketId, outcome.price, outcome.effective_odds, outcome.effective_odds, tokenId]
  );
  const outcomeId = mo.rows[0].id;

  if (!book.omit) {
    // Default: a single very deep level at the outcome price so any sane stake
    // fills fully (partial = false). asks are stored flat [p0,s0,p1,s1,...].
    const levels = book.asks ?? [[outcome.price, 1_000_000_000]];
    const flat = levels.flat();
    const bookUpdatedExpr = book.updated_at ?? FRESH;
    await c.query(
      `INSERT INTO market_outcome_books (polymarket_token_id, outcome_id, asks, bids, updated_at)
       VALUES ($1, $2, $3::numeric[], '{}'::numeric[], ${bookUpdatedExpr})`,
      [tokenId, outcomeId, flat]
    );
  }

  return { marketId, outcomeId, tokenId };
}

async function authAs(c: PoolClient, userId: string): Promise<void> {
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
  await authAs(c, USER1);
  const stake = args.stake ?? 10;
  const expected = args.expectedOdds === undefined ? null : args.expectedOdds;
  const res = await c.query<{ place_bet: string }>(
    `SELECT place_bet($1::uuid, $2::uuid, $3::numeric, $4::numeric) AS place_bet`,
    [args.marketId, args.outcomeId, stake, expected]
  );
  return res.rows[0].place_bet;
}

describe('place_bet shares model (require book)', () => {
  it('rejects when effective_odds exceeds the 1000 cap', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        { price: 0.5, effective_odds: 2000 }
      );
      await expect(callPlaceBet(c, { marketId, outcomeId })).rejects.toThrow(/odds out of bounds/i);
    });
  });

  it('rejects when there is no order book at all', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        { price: 0.5, effective_odds: 2 },
        { omit: true }
      );
      await expect(callPlaceBet(c, { marketId, outcomeId })).rejects.toThrow(/book unavailable/i);
    });
  });

  it('rejects when the book is stale (> 5s)', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        { price: 0.5, effective_odds: 2 },
        { updated_at: STALE_BOOK }
      );
      await expect(callPlaceBet(c, { marketId, outcomeId })).rejects.toThrow(/book is stale/i);
    });
  });

  it('rejects when the book cannot fully fill the stake (partial)', async () => {
    await withTransaction(async (c) => {
      // Depth = 0.5 * 10 = $5 USD; stake 25 > 5 → partial fill → reject.
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        { price: 0.5, effective_odds: 2 },
        { asks: [[0.5, 10]] }
      );
      await expect(callPlaceBet(c, { marketId, outcomeId, stake: 25 })).rejects.toThrow(
        /Insufficient liquidity/i
      );
    });
  });

  it('rejects a degenerate price at the exact ceiling (1)', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(c, {}, { price: 1, effective_odds: 1 });
      await expect(callPlaceBet(c, { marketId, outcomeId })).rejects.toThrow(
        /out of tradable range/i
      );
    });
  });

  it('accepts a sub-cent price at 0.005 (Polymarket parity)', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        { price: 0.005, effective_odds: 200 }
      );
      const betId = await callPlaceBet(c, { marketId, outcomeId, stake: 1, expectedOdds: 200 });
      expect(betId).toMatch(/^[0-9a-f-]{36}$/);

      const bet = await c.query<{
        locked_odds: string;
        potential_payout: string;
        shares: string;
        avg_price: string;
      }>('SELECT locked_odds, potential_payout, shares, avg_price FROM bets WHERE id = $1', [
        betId,
      ]);
      // stake 1 @ price 0.005 → shares = 200, payout = shares, locked_odds = 200.
      expect(Number(bet.rows[0].shares)).toBeCloseTo(200, 6);
      expect(Number(bet.rows[0].potential_payout)).toBeCloseTo(200, 6);
      expect(Number(bet.rows[0].locked_odds)).toBeCloseTo(200, 6);
      expect(Number(bet.rows[0].avg_price)).toBeCloseTo(0.005, 6);
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

  it('accepts when close_at IS NULL (status is the authority)', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(c, { close_at: null });
      const betId = await callPlaceBet(c, { marketId, outcomeId });
      expect(betId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('accepts when close_at has passed but status is still open (Polymarket still trades it)', async () => {
    // The Iran "June 30" case: Polymarket keeps the market tradable (closed=false)
    // past its stated endDate, so close_at is in the past but status='open'.
    // Availability is gated by status, not close_at → the bet must be accepted.
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(c, {
        close_at: "now() - interval '1 minute'",
      });
      const betId = await callPlaceBet(c, { marketId, outcomeId });
      expect(betId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('rejects when market status is not open (Polymarket closed it)', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(c, { status: 'closed' });
      await expect(callPlaceBet(c, { marketId, outcomeId })).rejects.toThrow(
        /not available for betting/i
      );
    });
  });

  it('rejects on expected_odds drift > 2%', async () => {
    await withTransaction(async (c) => {
      // Book @ price 0.5 → effective_odds 2. Client claims 1.9 → drift 5% → reject.
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        { price: 0.5, effective_odds: 2 }
      );
      await expect(callPlaceBet(c, { marketId, outcomeId, expectedOdds: 1.9 })).rejects.toThrow(
        /Odds changed/i
      );
    });
  });

  it('accepts when expected_odds drift is within 2%', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        { price: 0.5, effective_odds: 2 }
      );
      // Book eff_odds = 2; client claims 2.01 → drift 0.5% → accept.
      const betId = await callPlaceBet(c, { marketId, outcomeId, expectedOdds: 2.01 });
      expect(betId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('accepts when expected_odds is NULL (legacy client back-compat)', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        { price: 0.5, effective_odds: 2 }
      );
      const betId = await callPlaceBet(c, { marketId, outcomeId, expectedOdds: null });
      expect(betId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('happy path: stores shares/avg_price and debits the balance', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        { price: 0.4, effective_odds: 2.5 }
      );
      const before = await c.query<{ available: string }>(
        'SELECT available FROM balances WHERE user_id = $1',
        [USER1]
      );
      const availableBefore = Number(before.rows[0].available);

      // stake 25 @ book price 0.4 → shares = 62.5, eff_odds = 2.5.
      const betId = await callPlaceBet(c, { marketId, outcomeId, stake: 25, expectedOdds: 2.5 });

      const after = await c.query<{ available: string; in_play: string }>(
        'SELECT available, in_play FROM balances WHERE user_id = $1',
        [USER1]
      );
      expect(Number(after.rows[0].available)).toBe(availableBefore - 25);

      const bet = await c.query<{
        locked_odds: string;
        potential_payout: string;
        shares: string;
        avg_price: string;
      }>('SELECT locked_odds, potential_payout, shares, avg_price FROM bets WHERE id = $1', [
        betId,
      ]);
      expect(Number(bet.rows[0].shares)).toBeCloseTo(62.5, 6);
      expect(Number(bet.rows[0].potential_payout)).toBeCloseTo(62.5, 6);
      expect(Number(bet.rows[0].locked_odds)).toBeCloseTo(2.5, 6);
      expect(Number(bet.rows[0].avg_price)).toBeCloseTo(0.4, 6);
      // Invariant: potential_payout == shares, locked_odds == shares/stake.
      expect(Number(bet.rows[0].potential_payout)).toBeCloseTo(Number(bet.rows[0].shares), 6);
      expect(Number(bet.rows[0].locked_odds)).toBeCloseTo(Number(bet.rows[0].shares) / 25, 6);
    });
  });
});
