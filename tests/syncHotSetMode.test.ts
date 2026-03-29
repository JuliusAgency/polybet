import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const syncFunctionPath =
  '/home/dmitriy/Projects/JuliusAgency/polybet/polybet/supabase/functions/sync-polymarket-markets/index.ts';

test('sync function supports hot_set mode and target query for visible + in-play markets', () => {
  const source = fs.readFileSync(syncFunctionPath, 'utf8');

  assert.match(source, /mode\?: 'full' \| 'resolved_only' \| 'active_page' \| 'backfill' \| 'hot_set'/);
  assert.match(source, /if \(mode === 'hot_set'\)/);
  assert.match(source, /\.eq\('is_visible', true\)/);
  assert.match(source, /\.eq\('status', 'open'\)/);
  assert.match(source, /market_data_deltas/);
  assert.match(source, /buildOutcomePriceDeltas/);
});
