import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const useMarketsPath =
  '/home/dmitriy/Projects/JuliusAgency/polybet/polybet/src/features/bet/useMarkets.ts';
const marketCardPath =
  '/home/dmitriy/Projects/JuliusAgency/polybet/polybet/src/pages/user/MarketsFeedPage/components/MarketCard/MarketCard.tsx';

test('useMarkets selects status, sync timestamp and outcome probability fields', () => {
  const source = fs.readFileSync(useMarketsPath, 'utf8');

  assert.match(source, /status, winning_outcome_id/);
  assert.match(source, /last_synced_at/);
  assert.match(
    source,
    /market_outcomes[^']*\(id, name, price, odds, effective_odds, updated_at, polymarket_token_id\)/
  );
  // Event join carries the new volume column for header rollup.
  assert.match(source, /event:event_id\([^)]*volume[^)]*\)/);
});

test('MarketCard wires status, volume, close label and core atoms', () => {
  const source = fs.readFileSync(marketCardPath, 'utf8');

  assert.match(source, /t\(`markets\.status\./);
  assert.match(source, /t\('markets\.closesAt'\)/);
  assert.match(source, /t\('markets\.volumeShort'/);
  assert.match(source, /ProbabilityGauge/);
  assert.match(source, /OutcomeButtons/);
  assert.match(source, /MarketThumbnail/);
});
