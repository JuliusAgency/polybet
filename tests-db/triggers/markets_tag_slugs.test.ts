import { describe, expect, it } from 'vitest';
import { withTransaction } from '../helpers/pg';
import { seedEvent, seedEventWithMarket, seedMarket } from '../factories';

// Regression coverage for migration 069's tag_slugs denormalisation.
// markets.tag_slugs mirrors events.tag_slugs so the markets feed can filter
// by tag via a GIN index on markets directly, without an inner join to
// events (which timed out at 250s+ in production before this denorm).

describe('markets.tag_slugs denormalisation (migration 069)', () => {
  it('inherits tag_slugs from the parent event on INSERT via factories', async () => {
    await withTransaction(async (c) => {
      const { market } = await seedEventWithMarket(
        c,
        { tag_slugs: ['politics', 'fed'] },
        { polymarket_id: 'pm-tagged-1' }
      );
      expect(market.tag_slugs).toEqual(['politics', 'fed']);
    });
  });

  it('falls back to empty array when market has no event', async () => {
    await withTransaction(async (c) => {
      const m = await seedMarket(c, { event_id: null, polymarket_id: 'pm-no-event' });
      expect(m.tag_slugs).toEqual([]);
    });
  });

  it('propagates updated event.tag_slugs to all attached markets', async () => {
    await withTransaction(async (c) => {
      const event = await seedEvent(c, { tag_slugs: ['politics'] });
      await seedMarket(c, { event_id: event.id, polymarket_id: 'pm-tag-update-1' });
      await seedMarket(c, { event_id: event.id, polymarket_id: 'pm-tag-update-2' });

      await c.query("UPDATE events SET tag_slugs = ARRAY['politics', 'breaking'] WHERE id = $1", [
        event.id,
      ]);

      const rows = await c.query<{ tag_slugs: string[] }>(
        'SELECT tag_slugs FROM markets WHERE event_id = $1 ORDER BY polymarket_id',
        [event.id]
      );
      expect(rows.rows.map((r) => r.tag_slugs)).toEqual([
        ['politics', 'breaking'],
        ['politics', 'breaking'],
      ]);
    });
  });
});
