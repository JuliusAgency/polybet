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
  assert.match(source, /market_outcomes[^']*\(id, name, price, odds, effective_odds, polymarket_token_id\)/);
  assert.match(source, /\.in\('status', \['open', 'closed', 'resolved'\]\)/);
});

test('MarketCard renders source, status, updatedAt and probability labels', () => {
  const source = fs.readFileSync(marketCardPath, 'utf8');

  assert.match(source, /t\('markets\.source'\)/);
  assert.match(source, /t\(`markets\.status\./);
  assert.match(source, /t\('markets\.updatedAt'\)/);
  assert.match(source, /t\('markets\.probability'\)/);
  assert.match(source, /t\('markets\.finalOutcome'\)/);
});
