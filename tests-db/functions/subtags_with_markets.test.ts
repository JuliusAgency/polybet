import { describe, expect, it } from 'vitest';
import { withTransaction } from '../helpers/pg';
import { seedEvent, seedMarket } from '../factories';

// subtags_with_markets backs the feed sub-tag bar: it drops Polymarket related
// tags that have no visible market in our DB (their events were filtered out by
// the volume threshold) so a chip never opens an empty feed. tag_slugs is copied
// onto markets from the parent event by the markets_set_tag_slugs trigger.

async function setVisible(
  c: Parameters<Parameters<typeof withTransaction>[0]>[0],
  marketId: string,
  visible: boolean
): Promise<void> {
  await c.query('UPDATE markets SET is_visible = $2 WHERE id = $1', [marketId, visible]);
}

describe('subtags_with_markets RPC', () => {
  it('keeps only sub-tags that have a visible market', async () => {
    await withTransaction(async (c) => {
      const ev = await seedEvent(c, { tag_slugs: ['politics', 'iran'] });
      const m = await seedMarket(c, { event_id: ev.id, polymarket_id: 'pm-iran' });
      await setVisible(c, m.id, true);

      // 'peace-deal' has no market at all (threshold dropped its events).
      const res = await c.query<{ result: string[] }>(
        'SELECT subtags_with_markets($1, $2) AS result',
        ['politics', ['iran', 'peace-deal']]
      );
      expect(res.rows[0].result).toEqual(['iran']);
    });
  });

  it('requires the category match when a category is given, but not for the All bar', async () => {
    await withTransaction(async (c) => {
      // An 'iran' market tagged 'world' (not 'politics').
      const ev = await seedEvent(c, { tag_slugs: ['world', 'iran'] });
      const m = await seedMarket(c, { event_id: ev.id, polymarket_id: 'pm-iran-world' });
      await setVisible(c, m.id, true);

      const scoped = await c.query<{ result: string[] }>(
        'SELECT subtags_with_markets($1, $2) AS result',
        ['politics', ['iran']]
      );
      expect(scoped.rows[0].result).toEqual([]); // no politics+iran market

      const global = await c.query<{ result: string[] }>(
        'SELECT subtags_with_markets($1, $2) AS result',
        [null, ['iran']]
      );
      expect(global.rows[0].result).toEqual(['iran']); // exists globally
    });
  });

  it('preserves input order and ignores hidden markets', async () => {
    await withTransaction(async (c) => {
      const ev = await seedEvent(c, { tag_slugs: ['politics', 'trump', 'midterms'] });
      const visible = await seedMarket(c, { event_id: ev.id, polymarket_id: 'pm-visible' });
      await setVisible(c, visible.id, true);

      const evFed = await seedEvent(c, { tag_slugs: ['politics', 'fed'] });
      const hidden = await seedMarket(c, { event_id: evFed.id, polymarket_id: 'pm-hidden' });
      await setVisible(c, hidden.id, false);

      const res = await c.query<{ result: string[] }>(
        'SELECT subtags_with_markets($1, $2) AS result',
        ['politics', ['midterms', 'trump', 'fed']]
      );
      // 'fed' dropped (only a hidden market); order matches the input array.
      expect(res.rows[0].result).toEqual(['midterms', 'trump']);
    });
  });
});
