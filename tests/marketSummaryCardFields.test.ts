import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('MarketCard wires question, category, close_at and outcome data to new Polymarket-style layout', () => {
  const source = fs.readFileSync(
    'src/pages/user/MarketsFeedPage/components/MarketCard/MarketCard.tsx',
    'utf8'
  );

  assert.match(source, /market\.id/);
  assert.match(source, /market\.polymarket_id/);
  assert.match(source, /market\.question/);
  assert.match(source, /market\.category/);
  assert.match(source, /market\.close_at/);
  assert.match(source, /effective_odds/);
  assert.match(source, /MarketThumbnail/);
  assert.match(source, /ProbabilityGauge/);
  assert.match(source, /OutcomeButtons/);
  assert.match(source, /t\('markets\.chance'\)/);
  assert.match(source, /t\('markets\.volumeShort'/);
});

test('market summary labels exist in English and Hebrew locales', () => {
  const en = fs.readFileSync('src/shared/i18n/locales/en/translation.json', 'utf8');
  const he = fs.readFileSync('src/shared/i18n/locales/he/translation.json', 'utf8');

  assert.match(en, /"marketId"/);
  assert.match(en, /"polymarketId"/);
  assert.match(en, /"effectiveOdds"/);
  assert.match(en, /"chance"/);
  assert.match(en, /"volumeShort"/);
  assert.match(he, /"marketId"/);
  assert.match(he, /"polymarketId"/);
  assert.match(he, /"effectiveOdds"/);
  assert.match(he, /"chance"/);
  assert.match(he, /"volumeShort"/);
});
