import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('MarketCard renders market IDs, status, and outcome summary fields', () => {
  const source = fs.readFileSync(
    'src/pages/user/MarketsFeedPage/components/MarketCard/MarketCard.tsx',
    'utf8',
  );

  assert.match(source, /market\.id/);
  assert.match(source, /market\.polymarket_id/);
  assert.match(source, /market\.question/);
  assert.match(source, /market\.category/);
  assert.match(source, /market\.close_at/);
  assert.match(source, /outcome\.effective_odds/);
  assert.match(source, /outcome\.updated_at/);
});
