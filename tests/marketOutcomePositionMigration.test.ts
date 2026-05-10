import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Ensures the market_outcomes.position migration ships the column, the
// trigger that derives position from name, and the supporting index.
// Pinning these bits in a regression test prevents accidental drops during
// future migration consolidation.

test('market_outcomes.position migration adds column, trigger and index', () => {
  const dir = 'supabase/migrations';
  const file = fs.readdirSync(dir).find((f) => /market_outcome_position\.sql$/.test(f));
  assert.ok(file, 'market_outcome_position migration file should exist');

  const sql = fs.readFileSync(path.join(dir, file as string), 'utf8');

  assert.match(sql, /ADD COLUMN IF NOT EXISTS position smallint NOT NULL DEFAULT 0/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION market_outcomes_set_position/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF name ON market_outcomes/);
  assert.match(sql, /idx_market_outcomes_market_position/);
  // Trigger must map negative aliases to position 1.
  assert.match(sql, /WHEN 'no'\s+THEN 1/i);
});

test('market reads .order position to surface canonical Yes/No first', () => {
  const hooks = [
    'src/features/bet/useMarkets.ts',
    'src/features/bet/useMarketsByIds.ts',
    'src/features/bet/useEventsByIds.ts',
    'src/features/bet/useEventById.ts',
    'src/features/bet/useMarketRefresh.ts',
  ];

  for (const file of hooks) {
    const src = fs.readFileSync(file, 'utf8');
    assert.match(
      src,
      /\.order\(\s*'position'\s*,\s*\{\s*referencedTable:\s*'market_outcomes'/,
      `${file} must order embedded outcomes by position`
    );
  }
});
