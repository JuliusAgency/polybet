import { describe, expect, it } from 'vitest';
import { withTransaction } from '../helpers/pg';
import { seedEventWithMarket, seedMarket, seedOutcome } from '../factories';

// Coverage for migration 20260610115435_admin_bet_log_event_slug:
// admin_bet_log exposes `polymarket_event_slug` (events.slug) so the Global
// Bet Log can build the canonical Polymarket /event/{event_slug} link instead
// of the market slug, which 404s for sub-markets of multi-market events.
//
// Uses seeded user1 (0003); the pg connection is the postgres superuser so the
// security_invoker view reads without RLS friction. Everything rolls back.

const USER_ID = '00000000-0000-0000-0000-000000000003'; // user1

type Client = Parameters<Parameters<typeof withTransaction>[0]>[0];

async function insertFill(c: Client, marketId: string, outcomeId: string): Promise<string> {
  const pos = await c.query<{ id: string }>(
    `INSERT INTO positions (user_id, market_id, outcome_id, shares, avg_price, cost_basis, status)
     VALUES ($1, $2, $3, 10, 0.5, 5, 'open')
     RETURNING id`,
    [USER_ID, marketId, outcomeId]
  );
  const trade = await c.query<{ id: string }>(
    `INSERT INTO trades (position_id, user_id, market_id, outcome_id, side, shares, price, usd)
     VALUES ($1, $2, $3, $4, 'buy', 10, 0.5, 5)
     RETURNING id`,
    [pos.rows[0].id, USER_ID, marketId, outcomeId]
  );
  return trade.rows[0].id;
}

describe('admin_bet_log view (migration 20260610115435)', () => {
  it('exposes the event slug alongside the market slug', async () => {
    await withTransaction(async (c) => {
      const { event, market } = await seedEventWithMarket(c);
      await c.query(`UPDATE events SET slug = 'e-slug' WHERE id = $1`, [event.id]);
      await c.query(`UPDATE markets SET polymarket_slug = 'm-slug' WHERE id = $1`, [market.id]);
      const outcome = await seedOutcome(c, { market_id: market.id, name: 'Yes' });
      const tradeId = await insertFill(c, market.id, outcome.id);

      const res = await c.query<{ polymarket_slug: string; polymarket_event_slug: string }>(
        'SELECT polymarket_slug, polymarket_event_slug FROM admin_bet_log WHERE id = $1',
        [tradeId]
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].polymarket_slug).toBe('m-slug');
      expect(res.rows[0].polymarket_event_slug).toBe('e-slug');
    });
  });

  it('returns NULL event slug for a market without a linked event', async () => {
    await withTransaction(async (c) => {
      const market = await seedMarket(c, { event_id: null });
      const outcome = await seedOutcome(c, { market_id: market.id, name: 'Yes' });
      const tradeId = await insertFill(c, market.id, outcome.id);

      const res = await c.query<{ polymarket_event_slug: string | null }>(
        'SELECT polymarket_event_slug FROM admin_bet_log WHERE id = $1',
        [tradeId]
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].polymarket_event_slug).toBeNull();
    });
  });
});
