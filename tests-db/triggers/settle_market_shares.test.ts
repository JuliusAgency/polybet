import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { withTransaction } from '../helpers/pg';

// Coverage for settle_market in the POSITIONS model
// (migration 20260602131002_settle_market_on_positions): a winning position
// pays `shares` dollars (each share = $1) to available and releases cost_basis
// from in_play; a losing position releases cost_basis with no credit.
// Settlement is idempotent on positions: a re-entry pays nothing twice.

const USER1 = '00000000-0000-0000-0000-000000000003';
const FAR_FUTURE = "now() + interval '30 days'";

async function authAs(c: PoolClient, userId: string): Promise<void> {
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  await c.query(`SELECT set_config('role', 'authenticated', true)`);
}

async function actAsService(c: PoolClient): Promise<void> {
  // Clear the JWT claim so auth.uid() returns NULL → settle_market treats the
  // caller as the service role and skips the super_admin gate. Reset the
  // Postgres role back to the (superuser) test connection role.
  await c.query(`SELECT set_config('request.jwt.claims', NULL, true)`);
  await c.query(`RESET role`);
}

/** Seed an open market with Yes/No outcomes + a deep fresh book, then buy the
 *  Yes side through place_bet so a real position/trade is produced by the RPC. */
async function seedAndBet(
  c: PoolClient,
  opts: { price: number; stake: number }
): Promise<{ marketId: string; yesId: string; noId: string; positionId: string; shares: number }> {
  const yesToken = `tok-${crypto.randomUUID()}`;
  const noToken = `tok-${crypto.randomUUID()}`;

  const mk = await c.query<{ id: string }>(
    `INSERT INTO markets (polymarket_id, question, status, is_visible, close_at, last_synced_at)
     VALUES ('pm-settle-' || gen_random_uuid(), 'q?', 'open', true, ${FAR_FUTURE}, now())
     RETURNING id`
  );
  const marketId = mk.rows[0].id;

  const yes = await c.query<{ id: string }>(
    `INSERT INTO market_outcomes (market_id, name, price, odds, effective_odds, updated_at, polymarket_token_id)
     VALUES ($1, 'Yes', $2, $3, $3, now(), $4) RETURNING id`,
    [marketId, opts.price, 1 / opts.price, yesToken]
  );
  const yesId = yes.rows[0].id;

  const no = await c.query<{ id: string }>(
    `INSERT INTO market_outcomes (market_id, name, price, odds, effective_odds, updated_at, polymarket_token_id)
     VALUES ($1, 'No', $2, $3, $3, now(), $4) RETURNING id`,
    [marketId, 1 - opts.price, 1 / (1 - opts.price), noToken]
  );
  const noId = no.rows[0].id;

  await c.query(
    `INSERT INTO market_outcome_books (polymarket_token_id, outcome_id, asks, bids, updated_at)
     VALUES ($1, $2, $3::numeric[], '{}'::numeric[], now())`,
    [yesToken, yesId, [opts.price, 1_000_000_000]]
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
  return { marketId, yesId, noId, positionId, shares: Number(row.rows[0].shares) };
}

describe('settle_market pays shares (positions model)', () => {
  it('winner is credited exactly `shares` dollars', async () => {
    await withTransaction(async (c) => {
      const { marketId, yesId, positionId, shares } = await seedAndBet(c, {
        price: 0.4,
        stake: 25,
      });
      expect(shares).toBeCloseTo(62.5, 6); // 25 / 0.4

      const afterBet = await c.query<{ available: string; in_play: string }>(
        'SELECT available, in_play FROM balances WHERE user_id = $1',
        [USER1]
      );
      const availAfterBet = Number(afterBet.rows[0].available);

      await actAsService(c);
      const res = await c.query<{ settle_market: { settled: number; winners: number } }>(
        'SELECT settle_market($1::uuid, $2::uuid) AS settle_market',
        [marketId, yesId]
      );
      expect(res.rows[0].settle_market.winners).toBe(1);

      const afterSettle = await c.query<{ available: string; in_play: string }>(
        'SELECT available, in_play FROM balances WHERE user_id = $1',
        [USER1]
      );
      // Winner gets `shares` credited to available; in_play released.
      expect(Number(afterSettle.rows[0].available)).toBeCloseTo(availAfterBet + shares, 6);
      expect(Number(afterSettle.rows[0].in_play)).toBeCloseTo(0, 6);

      const pos = await c.query<{ status: string; cost_basis: string; realized_pnl: string }>(
        'SELECT status, cost_basis, realized_pnl FROM positions WHERE id = $1',
        [positionId]
      );
      expect(pos.rows[0].status).toBe('won');
      expect(Number(pos.rows[0].cost_basis)).toBeCloseTo(0, 6);
      // realized = shares - cost_basis = 62.5 - 25 = 37.5.
      expect(Number(pos.rows[0].realized_pnl)).toBeCloseTo(37.5, 6);

      const tx = await c.query<{ amount: string; note: string }>(
        `SELECT amount, note FROM balance_transactions WHERE position_id = $1 AND type = 'bet_payout'`,
        [positionId]
      );
      expect(Number(tx.rows[0].amount)).toBeCloseTo(shares, 6);
      expect(tx.rows[0].note).toBe('Position won');

      // Per-position settlement log written.
      const log = await c.query<{ outcome: string; payout: string; realized_pnl: string }>(
        'SELECT outcome, payout, realized_pnl FROM position_settlement_logs WHERE position_id = $1',
        [positionId]
      );
      expect(log.rows[0].outcome).toBe('won');
      expect(Number(log.rows[0].payout)).toBeCloseTo(62.5, 6);
    });
  });

  it('settlement is idempotent — a re-entry pays nothing twice', async () => {
    await withTransaction(async (c) => {
      const { marketId, yesId } = await seedAndBet(c, { price: 0.5, stake: 10 });

      await actAsService(c);
      await c.query('SELECT settle_market($1::uuid, $2::uuid)', [marketId, yesId]);
      const mid = await c.query<{ available: string }>(
        'SELECT available FROM balances WHERE user_id = $1',
        [USER1]
      );
      const availAfterFirst = Number(mid.rows[0].available);

      const res = await c.query<{ settle_market: { settled: number; already_settled: boolean } }>(
        'SELECT settle_market($1::uuid, $2::uuid) AS settle_market',
        [marketId, yesId]
      );
      expect(res.rows[0].settle_market.settled).toBe(0);
      expect(res.rows[0].settle_market.already_settled).toBe(true);

      const after = await c.query<{ available: string }>(
        'SELECT available FROM balances WHERE user_id = $1',
        [USER1]
      );
      expect(Number(after.rows[0].available)).toBeCloseTo(availAfterFirst, 6);
    });
  });

  it('loser forfeits the cost basis and receives no payout', async () => {
    await withTransaction(async (c) => {
      const { marketId, noId, positionId } = await seedAndBet(c, { price: 0.5, stake: 10 });

      const afterBet = await c.query<{ available: string }>(
        'SELECT available FROM balances WHERE user_id = $1',
        [USER1]
      );
      const availAfterBet = Number(afterBet.rows[0].available);

      // Settle with No as the winner — the user bought Yes, so they lose.
      await actAsService(c);
      await c.query('SELECT settle_market($1::uuid, $2::uuid)', [marketId, noId]);

      const afterSettle = await c.query<{ available: string; in_play: string }>(
        'SELECT available, in_play FROM balances WHERE user_id = $1',
        [USER1]
      );
      // No credit; in_play released, available unchanged from the post-bet state.
      expect(Number(afterSettle.rows[0].available)).toBeCloseTo(availAfterBet, 6);
      expect(Number(afterSettle.rows[0].in_play)).toBeCloseTo(0, 6);

      const pos = await c.query<{ status: string; realized_pnl: string }>(
        'SELECT status, realized_pnl FROM positions WHERE id = $1',
        [positionId]
      );
      expect(pos.rows[0].status).toBe('lost');
      // realized = -cost_basis = -10.
      expect(Number(pos.rows[0].realized_pnl)).toBeCloseTo(-10, 6);
    });
  });

  it('settles both a winning and a losing position in one call', async () => {
    await withTransaction(async (c) => {
      const yesToken = `tok-${crypto.randomUUID()}`;
      const noToken = `tok-${crypto.randomUUID()}`;
      const mk = await c.query<{ id: string }>(
        `INSERT INTO markets (polymarket_id, question, status, is_visible, close_at, last_synced_at)
         VALUES ('pm-wl-' || gen_random_uuid(), 'q?', 'open', true, ${FAR_FUTURE}, now()) RETURNING id`
      );
      const marketId = mk.rows[0].id;
      const yes = await c.query<{ id: string }>(
        `INSERT INTO market_outcomes (market_id, name, price, odds, effective_odds, updated_at, polymarket_token_id)
         VALUES ($1, 'Yes', 0.4, 2.5, 2.5, now(), $2) RETURNING id`,
        [marketId, yesToken]
      );
      const yesId = yes.rows[0].id;
      const no = await c.query<{ id: string }>(
        `INSERT INTO market_outcomes (market_id, name, price, odds, effective_odds, updated_at, polymarket_token_id)
         VALUES ($1, 'No', 0.6, 1.6667, 1.6667, now(), $2) RETURNING id`,
        [marketId, noToken]
      );
      const noId = no.rows[0].id;
      await c.query(
        `INSERT INTO market_outcome_books (polymarket_token_id, outcome_id, asks, bids, updated_at)
         VALUES ($1, $2, $3::numeric[], '{}'::numeric[], now()), ($4, $5, $6::numeric[], '{}'::numeric[], now())`,
        [yesToken, yesId, [0.4, 1_000_000_000], noToken, noId, [0.6, 1_000_000_000]]
      );

      const baseline = await c.query<{ in_play: string }>(
        'SELECT in_play FROM balances WHERE user_id = $1',
        [USER1]
      );
      const inPlayBaseline = Number(baseline.rows[0].in_play);

      await authAs(c, USER1);
      const yesPos = (
        await c.query<{ place_bet: string }>(
          `SELECT place_bet($1::uuid, $2::uuid, 20::numeric, NULL) AS place_bet`,
          [marketId, yesId]
        )
      ).rows[0].place_bet; // 20 @ 0.4 → 50 shares
      const noPos = (
        await c.query<{ place_bet: string }>(
          `SELECT place_bet($1::uuid, $2::uuid, 30::numeric, NULL) AS place_bet`,
          [marketId, noId]
        )
      ).rows[0].place_bet; // 30 @ 0.6 → 50 shares

      await actAsService(c);
      const res = await c.query<{
        settle_market: { settled: number; winners: number; losers: number };
      }>('SELECT settle_market($1::uuid, $2::uuid) AS settle_market', [marketId, yesId]);
      expect(res.rows[0].settle_market.settled).toBe(2);
      expect(res.rows[0].settle_market.winners).toBe(1);
      expect(res.rows[0].settle_market.losers).toBe(1);

      const yesStatus = await c.query<{ status: string }>(
        'SELECT status FROM positions WHERE id = $1',
        [yesPos]
      );
      const noStatus = await c.query<{ status: string }>(
        'SELECT status FROM positions WHERE id = $1',
        [noPos]
      );
      expect(yesStatus.rows[0].status).toBe('won');
      expect(noStatus.rows[0].status).toBe('lost');

      // Both positions' cost basis released → in_play back to baseline.
      const after = await c.query<{ in_play: string }>(
        'SELECT in_play FROM balances WHERE user_id = $1',
        [USER1]
      );
      expect(Number(after.rows[0].in_play)).toBeCloseTo(inPlayBaseline, 6);

      // Two per-position settlement logs (one won, one lost).
      const logs = await c.query<{ outcome: string }>(
        'SELECT outcome FROM position_settlement_logs WHERE position_id = ANY($1::uuid[]) ORDER BY outcome',
        [[yesPos, noPos]]
      );
      expect(logs.rows.map((r) => r.outcome)).toEqual(['lost', 'won']);
    });
  });
});
