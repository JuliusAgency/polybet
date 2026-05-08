import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('useMarkets selects all market summary and outcome update fields', () => {
  // The SELECT fields live in the shared MARKET_SELECT_FULL constant. The event
  // projection is composed from EVENT_SELECT (separate file) — read both.
  const source = fs.readFileSync('src/features/bet/useMarkets.ts', 'utf8');
  const selectSource = fs.readFileSync('src/shared/api/supabase/selects/marketSelect.ts', 'utf8');
  const eventSelectSource = fs.readFileSync(
    'src/shared/api/supabase/selects/eventSelect.ts',
    'utf8'
  );

  assert.match(source, /MARKET_SELECT_FULL/);
  assert.match(selectSource, /polymarket_id/);
  assert.match(selectSource, /question/);
  assert.match(selectSource, /category/);
  assert.match(selectSource, /close_at/);
  assert.match(selectSource, /status/);
  assert.match(selectSource, /market_outcomes[^']*updated_at/);
  // Event join is built from EVENT_SELECT — verify it references EVENT_SELECT
  // and the events projection itself includes the aggregated `volume` column
  // used for the card header rollup.
  assert.match(selectSource, /event:event_id\(\$\{EVENT_SELECT\}\)/);
  assert.match(eventSelectSource, /\bvolume\b/);
});
