import { describe, expect, it } from 'vitest';
import { withTransaction } from '../helpers/pg';

// Regression coverage for migration
// 20260527093751_fix_stranded_hidden_event_visibility.
//
// Events/markets first synced while sync_auto_show_all was OFF were inserted
// with is_visible=false. The old bulk_upsert_* RPCs never touched is_visible on
// conflict, so they stayed hidden forever even after the setting flipped ON —
// which (via the events + markets RLS policies) hid fully-synced, high-volume
// events like "2026 FIFA World Cup Winner" from every non-admin user.
//
// The fix: on conflict, is_visible = <current> OR auto_show_all.
//   * auto_show_all=true  -> promote hidden -> visible
//   * auto_show_all=false -> preserve current value (no downgrade, migration 073)

describe('bulk_upsert_events — is_visible promotion (migration 20260527093751)', () => {
  const payload = (pid: string) =>
    JSON.stringify([{ polymarket_id: pid, title: 'visibility-test-event', status: 'open' }]);

  it('promotes a hidden event to visible when auto_show_all=true', async () => {
    await withTransaction(async (c) => {
      const pid = 'pm-evt-vis-promote';
      await c.query(
        `INSERT INTO events (polymarket_id, title, is_visible) VALUES ($1, 't', false)`,
        [pid]
      );

      await c.query('SELECT * FROM bulk_upsert_events($1::jsonb, $2)', [payload(pid), true]);

      const res = await c.query<{ is_visible: boolean }>(
        'SELECT is_visible FROM events WHERE polymarket_id = $1',
        [pid]
      );
      expect(res.rows[0].is_visible).toBe(true);
    });
  });

  it('does NOT downgrade a visible event when auto_show_all=false', async () => {
    await withTransaction(async (c) => {
      const pid = 'pm-evt-vis-nodowngrade';
      await c.query(
        `INSERT INTO events (polymarket_id, title, is_visible) VALUES ($1, 't', true)`,
        [pid]
      );

      await c.query('SELECT * FROM bulk_upsert_events($1::jsonb, $2)', [payload(pid), false]);

      const res = await c.query<{ is_visible: boolean }>(
        'SELECT is_visible FROM events WHERE polymarket_id = $1',
        [pid]
      );
      expect(res.rows[0].is_visible).toBe(true);
    });
  });

  it('keeps a hidden event hidden when auto_show_all=false (moderation mode)', async () => {
    await withTransaction(async (c) => {
      const pid = 'pm-evt-vis-stayhidden';
      await c.query(
        `INSERT INTO events (polymarket_id, title, is_visible) VALUES ($1, 't', false)`,
        [pid]
      );

      await c.query('SELECT * FROM bulk_upsert_events($1::jsonb, $2)', [payload(pid), false]);

      const res = await c.query<{ is_visible: boolean }>(
        'SELECT is_visible FROM events WHERE polymarket_id = $1',
        [pid]
      );
      expect(res.rows[0].is_visible).toBe(false);
    });
  });
});

describe('bulk_upsert_markets — is_visible promotion (migration 20260527093751)', () => {
  const payload = (pid: string) =>
    JSON.stringify([{ polymarket_id: pid, question: 'visibility-test-market?', status: 'open' }]);

  it('promotes a hidden market to visible when auto_show_all=true', async () => {
    await withTransaction(async (c) => {
      const pid = 'pm-mkt-vis-promote';
      await c.query(
        `INSERT INTO markets (polymarket_id, question, is_visible) VALUES ($1, 'q?', false)`,
        [pid]
      );

      await c.query('SELECT * FROM bulk_upsert_markets($1::jsonb, $2)', [payload(pid), true]);

      const res = await c.query<{ is_visible: boolean }>(
        'SELECT is_visible FROM markets WHERE polymarket_id = $1',
        [pid]
      );
      expect(res.rows[0].is_visible).toBe(true);
    });
  });

  it('does NOT downgrade a visible market when auto_show_all=false', async () => {
    await withTransaction(async (c) => {
      const pid = 'pm-mkt-vis-nodowngrade';
      await c.query(
        `INSERT INTO markets (polymarket_id, question, is_visible) VALUES ($1, 'q?', true)`,
        [pid]
      );

      await c.query('SELECT * FROM bulk_upsert_markets($1::jsonb, $2)', [payload(pid), false]);

      const res = await c.query<{ is_visible: boolean }>(
        'SELECT is_visible FROM markets WHERE polymarket_id = $1',
        [pid]
      );
      expect(res.rows[0].is_visible).toBe(true);
    });
  });
});
