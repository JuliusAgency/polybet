import { describe, expect, it } from 'vitest';
import { withTransaction } from '../helpers/pg';

// Regression coverage for migration 20260616143809 (World Cup Games metadata):
//  - events gains game_start_time / sport / teams
//  - markets gains sports_market_type / line
//  - bulk_upsert_events / bulk_upsert_markets persist the new fields and
//    coalesce them on conflict (a later sync without the field must not erase
//    previously captured metadata).

describe('World Cup games metadata (migration 20260616143809)', () => {
  it('bulk_upsert_events persists sport / game_start_time / teams', async () => {
    await withTransaction(async (c) => {
      const res = await c.query<{ event_id: string }>(
        `select * from bulk_upsert_events($1::jsonb, true)`,
        [
          JSON.stringify([
            {
              polymarket_id: 'wc-evt-1',
              title: 'France vs. Senegal',
              status: 'open',
              tag_slugs: ['world-cup'],
              game_start_time: '2026-06-16T19:00:00Z',
              sport: 'fifwc',
              teams: [
                { name: 'France', abbreviation: 'fra', ordering: 'home' },
                { name: 'Senegal', abbreviation: 'sen', ordering: 'away' },
              ],
            },
          ]),
        ]
      );
      const eventId = res.rows[0].event_id;

      const row = await c.query<{ sport: string; game_start_time: string; n: number }>(
        `select sport, game_start_time, jsonb_array_length(teams) as n from events where id = $1`,
        [eventId]
      );
      expect(row.rows[0].sport).toBe('fifwc');
      expect(Number(row.rows[0].n)).toBe(2);
      expect(row.rows[0].game_start_time).not.toBeNull();
    });
  });

  it('bulk_upsert_events coalesces game metadata on conflict (never erases)', async () => {
    await withTransaction(async (c) => {
      const first = await c.query<{ event_id: string }>(
        `select * from bulk_upsert_events($1::jsonb, true)`,
        [
          JSON.stringify([
            {
              polymarket_id: 'wc-evt-2',
              title: 'Iraq vs. Norway',
              status: 'open',
              tag_slugs: ['world-cup'],
              sport: 'fifwc',
              game_start_time: '2026-06-17T01:00:00Z',
              teams: [{ name: 'Iraq', ordering: 'home' }],
            },
          ]),
        ]
      );
      const eventId = first.rows[0].event_id;

      // Second sync of the same event without game metadata (e.g. lifecycle
      // status sweep) must preserve the previously captured sport/teams.
      await c.query(`select * from bulk_upsert_events($1::jsonb, true)`, [
        JSON.stringify([
          {
            polymarket_id: 'wc-evt-2',
            title: 'Iraq vs. Norway',
            status: 'closed',
            tag_slugs: ['world-cup'],
          },
        ]),
      ]);

      const row = await c.query<{ sport: string | null; status: string; teams: unknown }>(
        `select sport, status, teams from events where id = $1`,
        [eventId]
      );
      expect(row.rows[0].sport).toBe('fifwc');
      expect(row.rows[0].status).toBe('closed');
      expect(row.rows[0].teams).not.toBeNull();
    });
  });

  it('bulk_upsert_markets persists sports_market_type / line', async () => {
    await withTransaction(async (c) => {
      const ev = await c.query<{ event_id: string }>(
        `select * from bulk_upsert_events($1::jsonb, true)`,
        [
          JSON.stringify([
            { polymarket_id: 'wc-evt-3', title: 'Game', status: 'open', tag_slugs: ['world-cup'] },
          ]),
        ]
      );
      const eventId = ev.rows[0].event_id;

      await c.query(`select * from bulk_upsert_markets($1::jsonb, true)`, [
        JSON.stringify([
          {
            polymarket_id: 'wc-mk-ml',
            question: 'Will France win?',
            status: 'open',
            event_id: eventId,
            group_label: 'France',
            sports_market_type: 'moneyline',
          },
          {
            polymarket_id: 'wc-mk-spread',
            question: 'France -1.5?',
            status: 'open',
            event_id: eventId,
            group_label: 'France',
            sports_market_type: 'spreads',
            line: -1.5,
          },
        ]),
      ]);

      const rows = await c.query<{ sports_market_type: string; line: string | null }>(
        `select sports_market_type, line from markets where polymarket_id in ('wc-mk-ml', 'wc-mk-spread') order by polymarket_id`
      );
      // ml row
      const ml = rows.rows.find((r) => r.sports_market_type === 'moneyline');
      const spread = rows.rows.find((r) => r.sports_market_type === 'spreads');
      expect(ml?.line).toBeNull();
      expect(Number(spread?.line)).toBe(-1.5);
    });
  });
});
