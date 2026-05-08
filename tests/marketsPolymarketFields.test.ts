import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const useMarketsPath = 'src/features/bet/useMarkets.ts';
const marketSelectPath = 'src/shared/api/supabase/selects/marketSelect.ts';
const marketCardPath = 'src/widgets/MarketCard/MarketCard.tsx';

test('useMarkets selects status, sync timestamp and outcome probability fields', () => {
  // The SELECT fields live in the shared MARKET_SELECT_FULL constant. The event
  // projection is composed from EVENT_SELECT (separate file) — read both.
  const source = fs.readFileSync(useMarketsPath, 'utf8');
  const selectSource = fs.readFileSync(marketSelectPath, 'utf8');
  const eventSelectSource = fs.readFileSync(
    'src/shared/api/supabase/selects/eventSelect.ts',
    'utf8'
  );

  assert.match(source, /MARKET_SELECT_FULL/);
  assert.match(selectSource, /status, winning_outcome_id/);
  assert.match(selectSource, /last_synced_at/);
  assert.match(
    selectSource,
    /market_outcomes[^']*\(id, name, price, odds, effective_odds, updated_at, polymarket_token_id\)/
  );
  // Event join is built from EVENT_SELECT — verify the embed and that the
  // events projection itself carries the `volume` column for header rollup.
  assert.match(selectSource, /event:event_id\(\$\{EVENT_SELECT\}\)/);
  assert.match(eventSelectSource, /\bvolume\b/);
});

test('MarketCard wires status, volume, close label and core atoms', () => {
  const source = fs.readFileSync(marketCardPath, 'utf8');

  assert.match(source, /t\(`markets\.status\./);
  assert.match(source, /t\('markets\.closesAt'\)/);
  assert.match(source, /t\('markets\.volumeShort'/);
  assert.match(source, /ChanceGauge/);
  assert.match(source, /OutcomeButtons/);
  assert.match(source, /MarketThumbnail/);
});
