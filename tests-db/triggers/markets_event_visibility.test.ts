import { describe, expect, it } from 'vitest';
import { withTransaction } from '../helpers/pg';

// Regression coverage for migration
// 20260618074742_fix_markets_event_visibility_denorm.
//
// markets.event_is_visible is denormalized from the parent event's is_visible
// (true when event_id IS NULL, or the parent event is is_visible=true). It backs
// the rewritten markets SELECT RLS policy "Authenticated users read visible
// markets", replacing the per-row EXISTS(events) subquery that made the Trending
// feed time out. Two triggers keep it in sync:
//   * trg_markets_set_event_is_visible — BEFORE INSERT/UPDATE OF event_id
//   * trg_events_propagate_is_visible  — AFTER UPDATE OF is_visible ON events

async function insertMarket(
  c: Parameters<Parameters<typeof withTransaction>[0]>[0],
  pid: string,
  eventId: string | null
): Promise<boolean> {
  const res = await c.query<{ event_is_visible: boolean }>(
    `INSERT INTO markets (polymarket_id, question, status, event_id)
     VALUES ($1, 'q?', 'open', $2)
     RETURNING event_is_visible`,
    [pid, eventId]
  );
  return res.rows[0].event_is_visible;
}

describe('markets.event_is_visible denorm (migration 20260618074742)', () => {
  it('a market under a VISIBLE event is event_is_visible=true', async () => {
    await withTransaction(async (c) => {
      const ev = await c.query<{ id: string }>(
        `INSERT INTO events (polymarket_id, title, is_visible) VALUES ('pm-ev-vis','t', true) RETURNING id`
      );
      expect(await insertMarket(c, 'pm-mkt-under-visible', ev.rows[0].id)).toBe(true);
    });
  });

  it('a market under a HIDDEN event is event_is_visible=false', async () => {
    await withTransaction(async (c) => {
      const ev = await c.query<{ id: string }>(
        `INSERT INTO events (polymarket_id, title, is_visible) VALUES ('pm-ev-hidden','t', false) RETURNING id`
      );
      expect(await insertMarket(c, 'pm-mkt-under-hidden', ev.rows[0].id)).toBe(false);
    });
  });

  it('a standalone market (event_id IS NULL) is event_is_visible=true', async () => {
    await withTransaction(async (c) => {
      expect(await insertMarket(c, 'pm-mkt-standalone', null)).toBe(true);
    });
  });

  it('promoting the parent event propagates event_is_visible=true to its markets', async () => {
    await withTransaction(async (c) => {
      const ev = await c.query<{ id: string }>(
        `INSERT INTO events (polymarket_id, title, is_visible) VALUES ('pm-ev-promote','t', false) RETURNING id`
      );
      await insertMarket(c, 'pm-mkt-promote', ev.rows[0].id); // starts false
      await c.query(`UPDATE events SET is_visible = true WHERE id = $1`, [ev.rows[0].id]);

      const res = await c.query<{ event_is_visible: boolean }>(
        `SELECT event_is_visible FROM markets WHERE polymarket_id = 'pm-mkt-promote'`
      );
      expect(res.rows[0].event_is_visible).toBe(true);
    });
  });

  it('hiding the parent event propagates event_is_visible=false to its markets', async () => {
    await withTransaction(async (c) => {
      const ev = await c.query<{ id: string }>(
        `INSERT INTO events (polymarket_id, title, is_visible) VALUES ('pm-ev-hide','t', true) RETURNING id`
      );
      await insertMarket(c, 'pm-mkt-hide', ev.rows[0].id); // starts true
      await c.query(`UPDATE events SET is_visible = false WHERE id = $1`, [ev.rows[0].id]);

      const res = await c.query<{ event_is_visible: boolean }>(
        `SELECT event_is_visible FROM markets WHERE polymarket_id = 'pm-mkt-hide'`
      );
      expect(res.rows[0].event_is_visible).toBe(false);
    });
  });

  it('reparenting a market to a hidden event flips event_is_visible to false', async () => {
    await withTransaction(async (c) => {
      const visible = await c.query<{ id: string }>(
        `INSERT INTO events (polymarket_id, title, is_visible) VALUES ('pm-ev-reparent-vis','t', true) RETURNING id`
      );
      const hidden = await c.query<{ id: string }>(
        `INSERT INTO events (polymarket_id, title, is_visible) VALUES ('pm-ev-reparent-hidden','t', false) RETURNING id`
      );
      await insertMarket(c, 'pm-mkt-reparent', visible.rows[0].id); // starts true
      await c.query(`UPDATE markets SET event_id = $1 WHERE polymarket_id = 'pm-mkt-reparent'`, [
        hidden.rows[0].id,
      ]);

      const res = await c.query<{ event_is_visible: boolean }>(
        `SELECT event_is_visible FROM markets WHERE polymarket_id = 'pm-mkt-reparent'`
      );
      expect(res.rows[0].event_is_visible).toBe(false);
    });
  });
});
