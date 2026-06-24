import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { withTransaction } from '../helpers/pg';

// Coverage for place_bet in the POSITIONS/TRADES model (migration
// 20260602130123_place_bet_positions_model). A buy REQUIRES a fresh,
// non-partial order-book quote — there is no mid-price fallback.
//
// place_bet enforces (in order):
//   1. account active, stake > 0, effective bet limit
//   2. market status='open' AND is_visible (close_at is informational)  [`not available for betting`]
//   3. outcome has polymarket_token_id                    [`not tradable (no Polymarket token)`]
//   4. price not null, not exact 0/1                      [`out of tradable range`]
//   5. effective_odds <= 1000                             [`Outcome odds out of bounds`]
//   6. book present (book_updated_at NOT NULL)            [`Market book unavailable`]
//   7. book fresh (<= 30s)                                [`Market book is stale`]
//   8. book non-partial AND shares > 0                    [`Insufficient liquidity`]
//   9. optional drift |expected - bookEffOdds|/bookEffOdds <= 2%  [`Odds changed`, P0002]
//
// NOTE (migration 20260624162430): the 3-minute indicative price-feed staleness
// guards on markets.last_synced_at and market_outcomes.updated_at were REMOVED.
// In the positions model the live order book (steps 6-7) is the authoritative
// price + liveness gate; a stale Gamma feed no longer blocks a bet as long as a
// fresh (<=30s) book is present.
//
// On success place_bet upserts a position (shares + volume-weighted avg_price +
// cost_basis) and appends a buy trade; it RETURNS the position id. The legacy
// bets table is no longer written.

const USER1 = '00000000-0000-0000-0000-000000000003';
const FAR_FUTURE = "now() + interval '30 days'";
const FRESH = 'now()';
const STALE = "now() - interval '10 minutes'";
// Comfortably past the 30s book-freshness bound (migration 20260603100437).
// now() advances during the txn, so an exact-30s value would be flaky. (The
// 3-min indicative price-feed guard was removed in 20260624162430, so the book
// is now the only staleness gate.)
const STALE_BOOK = "now() - interval '2 minutes'";

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
    // The trg_market_outcome_books_touch trigger (migration 20260609131610)
    // overwrites updated_at with now() on every write, so it must be bypassed to
    // seed a deliberately-aged book row (replica role skips triggers). This
    // honestly simulates "the book hasn't been written in N minutes".
    await c.query("SET LOCAL session_replication_role = 'replica'");
    await c.query(
      `INSERT INTO market_outcome_books (polymarket_token_id, outcome_id, asks, bids, updated_at)
       VALUES ($1, $2, $3::numeric[], '{}'::numeric[], ${bookUpdatedExpr})`,
      [tokenId, outcomeId, flat]
    );
    await c.query("SET LOCAL session_replication_role = 'origin'");
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

  it('rejects when the book is stale (> 30s)', async () => {
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
      const positionId = await callPlaceBet(c, {
        marketId,
        outcomeId,
        stake: 1,
        expectedOdds: 200,
      });
      expect(positionId).toMatch(/^[0-9a-f-]{36}$/);

      // stake 1 @ price 0.005 → shares = 200, cost_basis = stake = 1.
      const pos = await c.query<{
        shares: string;
        avg_price: string;
        cost_basis: string;
        status: string;
      }>('SELECT shares, avg_price, cost_basis, status FROM positions WHERE id = $1', [positionId]);
      expect(Number(pos.rows[0].shares)).toBeCloseTo(200, 6);
      expect(Number(pos.rows[0].avg_price)).toBeCloseTo(0.005, 6);
      expect(Number(pos.rows[0].cost_basis)).toBeCloseTo(1, 6);
      expect(pos.rows[0].status).toBe('open');

      const trade = await c.query<{ side: string; shares: string; price: string; usd: string }>(
        'SELECT side, shares, price, usd FROM trades WHERE position_id = $1',
        [positionId]
      );
      expect(trade.rows[0].side).toBe('buy');
      expect(Number(trade.rows[0].shares)).toBeCloseTo(200, 6);
      expect(Number(trade.rows[0].price)).toBeCloseTo(0.005, 6);
      expect(Number(trade.rows[0].usd)).toBeCloseTo(1, 6);
    });
  });

  it('accepts a stale indicative price feed when the live book is fresh (gates on the book, migration 20260624162430)', async () => {
    await withTransaction(async (c) => {
      // Indicative feed (markets.last_synced_at + market_outcomes.updated_at) is
      // 10 min stale — the OLD 3-min guard rejected this. The live order book is
      // fresh (seedFreshMarket default), so the positions-model gate accepts it.
      // This is the regression test for the 2026-06-24 "~70% of bets fail with
      // 'Market data is not up to date'" report.
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        { last_synced_at: STALE },
        { price: 0.5, effective_odds: 2, updated_at: STALE }
      );
      const positionId = await callPlaceBet(c, { marketId, outcomeId, expectedOdds: 2 });
      expect(positionId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('still rejects a stale indicative feed when the book is ALSO stale (book guard intact)', async () => {
    await withTransaction(async (c) => {
      // Feed stale AND book > 30s stale → the book-freshness guard (the real
      // gate) must still reject. Proves we narrowed the gate, not removed it.
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        { last_synced_at: STALE },
        { price: 0.5, effective_odds: 2, updated_at: STALE },
        { updated_at: STALE_BOOK }
      );
      await expect(callPlaceBet(c, { marketId, outcomeId })).rejects.toThrow(/book is stale/i);
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

  it('happy path: opens a position, appends a buy trade, locks the balance', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        { price: 0.4, effective_odds: 2.5 }
      );
      const before = await c.query<{ available: string; in_play: string }>(
        'SELECT available, in_play FROM balances WHERE user_id = $1',
        [USER1]
      );
      const availableBefore = Number(before.rows[0].available);
      const inPlayBefore = Number(before.rows[0].in_play);

      // stake 25 @ book price 0.4 → shares = 62.5, cost_basis = 25.
      const positionId = await callPlaceBet(c, {
        marketId,
        outcomeId,
        stake: 25,
        expectedOdds: 2.5,
      });

      const after = await c.query<{ available: string; in_play: string }>(
        'SELECT available, in_play FROM balances WHERE user_id = $1',
        [USER1]
      );
      // stake moves available -> in_play.
      expect(Number(after.rows[0].available)).toBe(availableBefore - 25);
      expect(Number(after.rows[0].in_play)).toBe(inPlayBefore + 25);

      const pos = await c.query<{
        shares: string;
        avg_price: string;
        cost_basis: string;
        status: string;
      }>('SELECT shares, avg_price, cost_basis, status FROM positions WHERE id = $1', [positionId]);
      expect(Number(pos.rows[0].shares)).toBeCloseTo(62.5, 6);
      expect(Number(pos.rows[0].avg_price)).toBeCloseTo(0.4, 6);
      // Invariant: cost_basis == shares * avg_price == stake.
      expect(Number(pos.rows[0].cost_basis)).toBeCloseTo(25, 6);
      expect(pos.rows[0].status).toBe('open');

      const trade = await c.query<{
        side: string;
        shares: string;
        price: string;
        usd: string;
        realized_pnl: string;
      }>('SELECT side, shares, price, usd, realized_pnl FROM trades WHERE position_id = $1', [
        positionId,
      ]);
      expect(trade.rows).toHaveLength(1);
      expect(trade.rows[0].side).toBe('buy');
      expect(Number(trade.rows[0].shares)).toBeCloseTo(62.5, 6);
      expect(Number(trade.rows[0].price)).toBeCloseTo(0.4, 6);
      expect(Number(trade.rows[0].usd)).toBeCloseTo(25, 6);
      expect(Number(trade.rows[0].realized_pnl)).toBe(0);

      // Ledger: one bet_lock for -stake keyed on the trade + position.
      const tx = await c.query<{ type: string; amount: string }>(
        'SELECT type, amount FROM balance_transactions WHERE position_id = $1',
        [positionId]
      );
      expect(tx.rows).toHaveLength(1);
      expect(tx.rows[0].type).toBe('bet_lock');
      expect(Number(tx.rows[0].amount)).toBe(-25);
    });
  });

  it('aggregates a second buy on the same outcome into one position (weighted avg)', async () => {
    await withTransaction(async (c) => {
      const { marketId, outcomeId } = await seedFreshMarket(
        c,
        {},
        { price: 0.4, effective_odds: 2.5 }
      );
      // Buy 1: $40 @ 0.40 → 100 shares.
      const pid1 = await callPlaceBet(c, { marketId, outcomeId, stake: 40, expectedOdds: 2.5 });
      // Buy 2: $30 @ 0.40 → 75 shares. Same outcome → same position row.
      const pid2 = await callPlaceBet(c, { marketId, outcomeId, stake: 30, expectedOdds: 2.5 });
      expect(pid2).toBe(pid1);

      const pos = await c.query<{ shares: string; avg_price: string; cost_basis: string }>(
        'SELECT shares, avg_price, cost_basis FROM positions WHERE id = $1',
        [pid1]
      );
      // 175 shares, cost 70, weighted avg 70/175 = 0.40.
      expect(Number(pos.rows[0].shares)).toBeCloseTo(175, 6);
      expect(Number(pos.rows[0].cost_basis)).toBeCloseTo(70, 6);
      expect(Number(pos.rows[0].avg_price)).toBeCloseTo(0.4, 6);

      // Two buy trades recorded against the one position.
      const trades = await c.query('SELECT 1 FROM trades WHERE position_id = $1 AND side = $2', [
        pid1,
        'buy',
      ]);
      expect(trades.rows).toHaveLength(2);
    });
  });
});
