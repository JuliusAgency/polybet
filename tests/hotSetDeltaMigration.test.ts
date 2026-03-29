import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath =
  '/home/dmitriy/Projects/JuliusAgency/polybet/polybet/supabase/migrations/029_polymarket_hot_set_and_deltas.sql';

test('hot-set + delta migration creates history table, source columns, and minute cron', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /ALTER TABLE markets ADD COLUMN IF NOT EXISTS polymarket_status_raw text;/);
  assert.match(sql, /ALTER TABLE markets ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;/);
  assert.match(sql, /ALTER TABLE market_outcomes[\s\S]*ADD COLUMN IF NOT EXISTS price numeric/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS market_data_deltas \(/);
  assert.match(sql, /event_type\s+text NOT NULL CHECK \(event_type IN \('market_created', 'status_changed', 'outcome_price_changed', 'market_resolved'\)\)/);
  assert.match(sql, /'sync-hot-set-markets'/);
  assert.match(sql, /'\*\/1 \* \* \* \*'/);
});
