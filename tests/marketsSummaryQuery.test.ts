import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('useMarkets selects all market summary and outcome update fields', () => {
  const source = fs.readFileSync('src/features/bet/useMarkets.ts', 'utf8');

  assert.match(source, /polymarket_id/);
  assert.match(source, /question/);
  assert.match(source, /category/);
  assert.match(source, /close_at/);
  assert.match(source, /status/);
  assert.match(source, /market_outcomes[^']*updated_at/);
  // Event join now carries the aggregated volume column for the card header.
  assert.match(source, /event:event_id\([^)]*volume[^)]*\)/);
});
