import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { withTransaction } from '../helpers/pg';

// Coverage for sell_position + quote_sell_proceeds (migration
// 20260602130622_quote_sell_and_sell_position): the early-exit (SELL) path.
//
// A user sells shares of an open position back to the house at the slippage-
// adjusted bid price. Proceeds credit `available`; the SOLD cost basis is
// released from `in_play`; the difference (proceeds - shares*avg_price) is the
// realized P/L. Guards mirror the buy path: fresh (<=5s) non-partial bid quote,
// open+visible market, 2% price-drift tolerance, can't oversell.

const USER1 = '00000000-0000-0000-0000-000000000003';
const USER2 = '00000000-0000-0000-0000-000000000004';
const FAR_FUTURE = "now() + interval '30 days'";

async function authAs(c: PoolClient, userId: string): Promise<void> {
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  await c.query(`SELECT set_config('role', 'authenticated', true)`);
}

async function actAsService(c: PoolClient): Promise<void> {
  await c.query(`SELECT set_config('request.jwt.claims', NULL, true)`);
  await c.query(`RESET role`);
}

interface SeedOpts {
  /** Outcome / ask price the buy fills at. */
  price: number;
  /** USD stake for the opening buy. */
  stake: number;
  /** Bid levels [price, size] for the sell side. Default: deep level at 0.50. */
  bids?: Array<[number, number]>;
}

/** Seed an open market + Yes outcome with deep asks (for the buy) and bids (for
 *  the sell), then open a position via place_bet. Returns the seeded ids. */
async function seedAndBuy(
  c: PoolClient,
  opts: SeedOpts
): Promise<{
  marketId: string;
  yesId: string;
  tokenId: string;
  positionId: string;
  shares: number;
}> {
  const tokenId = `tok-${crypto.randomUUID()}`;

  const mk = await c.query<{ id: string }>(
    `INSERT INTO markets (polymarket_id, question, status, is_visible, close_at, last_synced_at)
     VALUES ('pm-sell-' || gen_random_uuid(), 'q?', 'open', true, ${FAR_FUTURE}, now())
     RETURNING id`
  );
  const marketId = mk.rows[0].id;

  const yes = await c.query<{ id: string }>(
    `INSERT INTO market_outcomes (market_id, name, price, odds, effective_odds, updated_at, polymarket_token_id)
     VALUES ($1, 'Yes', $2, $3, $3, now(), $4) RETURNING id`,
    [marketId, opts.price, 1 / opts.price, tokenId]
  );
  const yesId = yes.rows[0].id;

  const bids = (opts.bids ?? [[0.5, 1_000_000_000]]).flat();
  await c.query(
    `INSERT INTO market_outcome_books (polymarket_token_id, outcome_id, asks, bids, updated_at)
     VALUES ($1, $2, $3::numeric[], $4::numeric[], now())`,
    [tokenId, yesId, [opts.price, 1_000_000_000], bids]
  );

  await authAs(c, USER1);
  const placed = await c.query<{ place_bet: string }>(
    `SELECT place_bet($1::uuid, $2::uuid, $3::numeric, NULL) AS place_bet`,
    [marketId, yesId, opts.stake]
  );
  const positionId = placed.rows[0].place_bet;
  const row = await c.query<{ shares: string }>('SELECT shares FROM positions WHERE id = $1', [
    positionId,
  ]);
  return { marketId, yesId, tokenId, positionId, shares: Number(row.rows[0].shares) };
}

async function callSell(
  c: PoolClient,
  positionId: string,
  shares: number,
  expectedPrice: number | null = null
): Promise<Record<string, unknown>> {
  await authAs(c, USER1);
  const res = await c.query<{ sell_position: Record<string, unknown> }>(
    'SELECT sell_position($1::uuid, $2::numeric, $3::numeric) AS sell_position',
    [positionId, shares, expectedPrice]
  );
  return res.rows[0].sell_position;
}

describe('quote_sell_proceeds', () => {
  it('walks bids descending and reports slippage / partial', async () => {
    await withTransaction(async (c) => {
      const { tokenId } = await seedAndBuy(c, {
        price: 0.4,
        stake: 1, // tiny buy; we only need the book row
        bids: [
          [0.55, 100],
          [0.5, 50],
        ],
      });
      const full = await c.query<{
        proceeds: string;
        filled_shares: string;
        avg_price: string;
        partial: boolean;
      }>('SELECT * FROM quote_sell_proceeds($1, $2::numeric)', [tokenId, 120]);
      // 100@0.55 + 20@0.50 = 55 + 10 = 65; avg 65/120.
      expect(Number(full.rows[0].proceeds)).toBeCloseTo(65, 6);
      expect(Number(full.rows[0].filled_shares)).toBeCloseTo(120, 6);
      expect(full.rows[0].partial).toBe(false);

      const partial = await c.query<{ proceeds: string; filled_shares: string; partial: boolean }>(
        'SELECT * FROM quote_sell_proceeds($1, $2::numeric)',
        [tokenId, 200]
      );
      // Only 150 shares of depth → partial; proceeds 55 + 25 = 80.
      expect(Number(partial.rows[0].proceeds)).toBeCloseTo(80, 6);
      expect(Number(partial.rows[0].filled_shares)).toBeCloseTo(150, 6);
      expect(partial.rows[0].partial).toBe(true);
    });
  });
});

describe('sell_position', () => {
  it('full sell closes the position and credits proceeds', async () => {
    await withTransaction(async (c) => {
      // Buy 100 shares @ 0.40 (cost 40). Bid 0.50 deep.
      const { positionId, shares } = await seedAndBuy(c, { price: 0.4, stake: 40 });
      expect(shares).toBeCloseTo(100, 6);

      const before = await c.query<{ available: string; in_play: string }>(
        'SELECT available, in_play FROM balances WHERE user_id = $1',
        [USER1]
      );
      const availBefore = Number(before.rows[0].available);
      const inPlayBefore = Number(before.rows[0].in_play);

      const out = await callSell(c, positionId, 100, 0.5);
      // proceeds 100*0.50 = 50; realized = 50 - 100*0.40 = 10.
      expect(Number(out.proceeds)).toBeCloseTo(50, 6);
      expect(Number(out.realized_pnl)).toBeCloseTo(10, 6);
      expect(out.status).toBe('closed');
      expect(Number(out.remaining_shares)).toBeCloseTo(0, 6);

      const pos = await c.query<{
        shares: string;
        cost_basis: string;
        realized_pnl: string;
        status: string;
      }>('SELECT shares, cost_basis, realized_pnl, status FROM positions WHERE id = $1', [
        positionId,
      ]);
      expect(Number(pos.rows[0].shares)).toBeCloseTo(0, 6);
      expect(Number(pos.rows[0].cost_basis)).toBeCloseTo(0, 6);
      expect(Number(pos.rows[0].realized_pnl)).toBeCloseTo(10, 6);
      expect(pos.rows[0].status).toBe('closed');

      const after = await c.query<{ available: string; in_play: string }>(
        'SELECT available, in_play FROM balances WHERE user_id = $1',
        [USER1]
      );
      // available += proceeds (50); in_play -= cost sold (40).
      expect(Number(after.rows[0].available)).toBeCloseTo(availBefore + 50, 6);
      expect(Number(after.rows[0].in_play)).toBeCloseTo(inPlayBefore - 40, 6);

      const trade = await c.query<{
        side: string;
        shares: string;
        usd: string;
        realized_pnl: string;
      }>(
        `SELECT side, shares, usd, realized_pnl FROM trades WHERE position_id = $1 AND side = 'sell'`,
        [positionId]
      );
      expect(trade.rows).toHaveLength(1);
      expect(Number(trade.rows[0].usd)).toBeCloseTo(50, 6);
      expect(Number(trade.rows[0].realized_pnl)).toBeCloseTo(10, 6);

      const tx = await c.query<{ amount: string; type: string }>(
        `SELECT amount, type FROM balance_transactions WHERE position_id = $1 AND type = 'bet_sell'`,
        [positionId]
      );
      expect(Number(tx.rows[0].amount)).toBeCloseTo(50, 6);
    });
  });

  it('partial sell keeps the position open with a reduced, same-priced stake', async () => {
    await withTransaction(async (c) => {
      // Buy 100 @ 0.40 (cost 40). Sell 40 shares @ bid 0.50.
      const { positionId } = await seedAndBuy(c, { price: 0.4, stake: 40 });

      const out = await callSell(c, positionId, 40, 0.5);
      // proceeds 40*0.50 = 20; realized = 20 - 40*0.40 = 4.
      expect(Number(out.proceeds)).toBeCloseTo(20, 6);
      expect(Number(out.realized_pnl)).toBeCloseTo(4, 6);
      expect(out.status).toBe('open');

      const pos = await c.query<{
        shares: string;
        avg_price: string;
        cost_basis: string;
        realized_pnl: string;
      }>('SELECT shares, avg_price, cost_basis, realized_pnl FROM positions WHERE id = $1', [
        positionId,
      ]);
      // 60 shares left; avg_price UNCHANGED at 0.40; cost_basis 60*0.40 = 24.
      expect(Number(pos.rows[0].shares)).toBeCloseTo(60, 6);
      expect(Number(pos.rows[0].avg_price)).toBeCloseTo(0.4, 6);
      expect(Number(pos.rows[0].cost_basis)).toBeCloseTo(24, 6);
      expect(Number(pos.rows[0].realized_pnl)).toBeCloseTo(4, 6);
    });
  });

  it('rejects selling more shares than held', async () => {
    await withTransaction(async (c) => {
      const { positionId } = await seedAndBuy(c, { price: 0.4, stake: 40 }); // 100 shares
      await expect(callSell(c, positionId, 200, 0.5)).rejects.toThrow(/more shares than held/i);
    });
  });

  it('rejects when bid depth cannot absorb the size (partial)', async () => {
    await withTransaction(async (c) => {
      // Only 10 shares of bid depth, but the position holds 100.
      const { positionId } = await seedAndBuy(c, {
        price: 0.4,
        stake: 40,
        bids: [[0.5, 10]],
      });
      await expect(callSell(c, positionId, 100, 0.5)).rejects.toThrow(/Insufficient liquidity/i);
    });
  });

  it('rejects on a stale bid book (> 30s)', async () => {
    await withTransaction(async (c) => {
      const { positionId, tokenId } = await seedAndBuy(c, { price: 0.4, stake: 40 });
      // Age the book past the 30s freshness bound (migration 20260603100437).
      // RESET role first: seedAndBuy left the connection as 'authenticated',
      // which RLS blocks from writing market_outcome_books — the UPDATE would
      // silently affect 0 rows.
      await c.query('RESET role');
      // Bypass trg_market_outcome_books_touch (migration 20260609131610), which
      // would otherwise re-stamp updated_at to now() and defeat this aging.
      await c.query("SET LOCAL session_replication_role = 'replica'");
      await c.query(
        `UPDATE market_outcome_books SET updated_at = now() - interval '2 minutes' WHERE polymarket_token_id = $1`,
        [tokenId]
      );
      await c.query("SET LOCAL session_replication_role = 'origin'");
      await expect(callSell(c, positionId, 100, 0.5)).rejects.toThrow(/book is stale/i);
    });
  });

  it('rejects when the sell price drifts more than 2% from expected', async () => {
    await withTransaction(async (c) => {
      // Actual bid 0.50; client claims it expected 0.60 → 20% drift → reject.
      const { positionId } = await seedAndBuy(c, { price: 0.4, stake: 40 });
      await expect(callSell(c, positionId, 100, 0.6)).rejects.toThrow(/Price changed/i);
    });
  });

  it('rejects selling on a market that is no longer open', async () => {
    await withTransaction(async (c) => {
      const { positionId, marketId } = await seedAndBuy(c, { price: 0.4, stake: 40 });
      // RESET role so the status flip bypasses RLS (see stale-book test above).
      await c.query('RESET role');
      await c.query(`UPDATE markets SET status = 'closed' WHERE id = $1`, [marketId]);
      await expect(callSell(c, positionId, 100, 0.5)).rejects.toThrow(/not available for selling/i);
    });
  });

  it('rejects selling a position owned by another user', async () => {
    await withTransaction(async (c) => {
      const { positionId } = await seedAndBuy(c, { price: 0.4, stake: 40 });
      // USER2 (authenticated) tries to sell USER1's position.
      await authAs(c, USER2);
      const attempt = c.query('SELECT sell_position($1::uuid, $2::numeric, $3::numeric)', [
        positionId,
        50,
        0.5,
      ]);
      await expect(attempt).rejects.toThrow(/not found or not sellable/i);
    });
  });

  it('re-buying a sold-out outcome reopens the same position and carries realized P/L', async () => {
    await withTransaction(async (c) => {
      const { marketId, yesId, positionId } = await seedAndBuy(c, { price: 0.4, stake: 40 }); // 100 @ 0.40
      // Sell all 100 @ 0.50 → realized +10, position closes.
      await callSell(c, positionId, 100, 0.5);

      // Re-buy 40 @ 0.40 → 100 new shares on the SAME (user, outcome) row.
      await authAs(c, USER1);
      const reopened = await c.query<{ place_bet: string }>(
        `SELECT place_bet($1::uuid, $2::uuid, $3::numeric, NULL) AS place_bet`,
        [marketId, yesId, 40]
      );
      expect(reopened.rows[0].place_bet).toBe(positionId);

      const pos = await c.query<{
        shares: string;
        avg_price: string;
        cost_basis: string;
        realized_pnl: string;
        status: string;
      }>(
        'SELECT shares, avg_price, cost_basis, realized_pnl, status FROM positions WHERE id = $1',
        [positionId]
      );
      expect(pos.rows[0].status).toBe('open');
      expect(Number(pos.rows[0].shares)).toBeCloseTo(100, 6);
      expect(Number(pos.rows[0].avg_price)).toBeCloseTo(0.4, 6);
      expect(Number(pos.rows[0].cost_basis)).toBeCloseTo(40, 6);
      // realized_pnl carries the +10 crystallized by the prior sell.
      expect(Number(pos.rows[0].realized_pnl)).toBeCloseTo(10, 6);
    });
  });

  it('partial sell then settlement: in_play fully released, realized accumulates', async () => {
    await withTransaction(async (c) => {
      const { marketId, yesId, positionId } = await seedAndBuy(c, { price: 0.4, stake: 40 }); // 100 @ 0.40, cost 40
      const postBuy = await c.query<{ available: string; in_play: string }>(
        'SELECT available, in_play FROM balances WHERE user_id = $1',
        [USER1]
      );
      const availPostBuy = Number(postBuy.rows[0].available);
      const inPlayPostBuy = Number(postBuy.rows[0].in_play);

      // Sell 40 @ 0.50 → proceeds 20, realized +4; remaining 60 @ 0.40, cost_basis 24.
      await callSell(c, positionId, 40, 0.5);

      // Settle Yes as the winner.
      await actAsService(c);
      await c.query('SELECT settle_market($1::uuid, $2::uuid)', [marketId, yesId]);

      const pos = await c.query<{ status: string; cost_basis: string; realized_pnl: string }>(
        'SELECT status, cost_basis, realized_pnl FROM positions WHERE id = $1',
        [positionId]
      );
      expect(pos.rows[0].status).toBe('won');
      expect(Number(pos.rows[0].cost_basis)).toBeCloseTo(0, 6);
      // realized = sell(+4) + settle(60 - 24 = +36) = +40.
      expect(Number(pos.rows[0].realized_pnl)).toBeCloseTo(40, 6);

      const after = await c.query<{ available: string; in_play: string }>(
        'SELECT available, in_play FROM balances WHERE user_id = $1',
        [USER1]
      );
      // available: +20 (sell) +60 (winning payout) over the post-buy figure.
      expect(Number(after.rows[0].available)).toBeCloseTo(availPostBuy + 80, 6);
      // in_play: -16 (sell releases 40*0.40) -24 (settle releases remaining) = -40.
      expect(Number(after.rows[0].in_play)).toBeCloseTo(inPlayPostBuy - 40, 6);
    });
  });
});
