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

// Sub-tag bar filtering: market-tracker now persists granular Polymarket tag
// slugs (Iran, Trump, …) alongside the category slug in events/markets.tag_slugs
// (buildTagSlugs). The feed's useMarkets narrows with a single
// `tag_slugs @> {category, subTag}` predicate hitting idx_markets_tag_slugs_visible.
// This proves that containment works against the multi-element arrays.
describe('sub-tag containment filter (feed useMarkets)', () => {
  it('matches a market by category + granular sub-tag, excludes non-matching', async () => {
    await withTransaction(async (c) => {
      const iran = await seedEvent(c, { tag_slugs: ['politics', 'iran', 'geopolitics'] });
      await seedMarket(c, { event_id: iran.id, polymarket_id: 'pm-sub-iran' });

      const trump = await seedEvent(c, { tag_slugs: ['politics', 'trump'] });
      await seedMarket(c, { event_id: trump.id, polymarket_id: 'pm-sub-trump' });

      // politics + iran → only the Iran market.
      const both = await c.query<{ polymarket_id: string }>(
        "SELECT polymarket_id FROM markets WHERE tag_slugs @> ARRAY['politics','iran'] AND polymarket_id LIKE 'pm-sub-%' ORDER BY polymarket_id"
      );
      expect(both.rows.map((r) => r.polymarket_id)).toEqual(['pm-sub-iran']);

      // sub-tag alone (Trending-style) → only the Trump market.
      const subOnly = await c.query<{ polymarket_id: string }>(
        "SELECT polymarket_id FROM markets WHERE tag_slugs @> ARRAY['trump'] AND polymarket_id LIKE 'pm-sub-%' ORDER BY polymarket_id"
      );
      expect(subOnly.rows.map((r) => r.polymarket_id)).toEqual(['pm-sub-trump']);
    });
  });
});
