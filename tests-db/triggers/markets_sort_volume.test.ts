import { describe, expect, it } from 'vitest';
import { withTransaction } from '../helpers/pg';

// Regression coverage for migration 057's denormalisation.
// markets.sort_volume is computed from events.volume (preferred) with a
// fallback to markets.volume. Two triggers keep it in sync:
//   * markets_set_sort_volume  BEFORE INSERT/UPDATE OF (volume, event_id)
//   * events_propagate_sort_volume AFTER UPDATE OF events.volume
// The whole feed cursor index (idx_markets_visible_sort_volume) relies on
// sort_volume being correct — a regression here corrupts pagination order.

describe('markets.sort_volume denormalisation (migration 057)', () => {
  it('inherits sort_volume from the parent event on INSERT', async () => {
    await withTransaction(async (c) => {
      const ev = await c.query<{ id: string }>(
        "INSERT INTO events (title, volume) VALUES ('test-evt', 1_000_000) RETURNING id"
      );
      const eventId = ev.rows[0].id;

      const mk = await c.query<{ sort_volume: string }>(
        `INSERT INTO markets (polymarket_id, question, event_id, volume)
         VALUES ('pm-test-1', 'q?', $1, 50)
         RETURNING sort_volume`,
        [eventId]
      );

      // event volume wins over market volume.
      expect(Number(mk.rows[0].sort_volume)).toBe(1_000_000);
    });
  });

  it('falls back to markets.volume when event_id is NULL', async () => {
    await withTransaction(async (c) => {
      const mk = await c.query<{ sort_volume: string }>(
        `INSERT INTO markets (polymarket_id, question, volume)
         VALUES ('pm-test-2', 'q?', 777)
         RETURNING sort_volume`
      );
      expect(Number(mk.rows[0].sort_volume)).toBe(777);
    });
  });

  it('defaults to 0 when both event.volume and market.volume are absent', async () => {
    await withTransaction(async (c) => {
      const mk = await c.query<{ sort_volume: string }>(
        `INSERT INTO markets (polymarket_id, question) VALUES ('pm-test-3', 'q?')
         RETURNING sort_volume`
      );
      expect(Number(mk.rows[0].sort_volume)).toBe(0);
    });
  });

  it('propagates updated event.volume to all attached markets', async () => {
    await withTransaction(async (c) => {
      const ev = await c.query<{ id: string }>(
        "INSERT INTO events (title, volume) VALUES ('test-evt-2', 100) RETURNING id"
      );
      const eventId = ev.rows[0].id;

      await c.query(
        `INSERT INTO markets (polymarket_id, question, event_id) VALUES
           ('pm-test-4a', 'qa?', $1),
           ('pm-test-4b', 'qb?', $1)`,
        [eventId]
      );

      // Bumping the event volume must cascade — feed ranking depends on it.
      await c.query('UPDATE events SET volume = 999_999 WHERE id = $1', [eventId]);

      const rows = await c.query<{ sort_volume: string }>(
        'SELECT sort_volume FROM markets WHERE event_id = $1 ORDER BY polymarket_id',
        [eventId]
      );
      expect(rows.rows.map((r) => Number(r.sort_volume))).toEqual([999_999, 999_999]);
    });
  });
});
