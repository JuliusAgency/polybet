import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const useMyBetsPath =
  '/home/dmitriy/Projects/JuliusAgency/polybet/polybet/src/features/bet/useMyBets.ts';

test('useMyBets selects outcome_id and market final outcome fields', () => {
  const source = fs.readFileSync(useMyBetsPath, 'utf8');

  assert.match(source, /outcome_id/);
  assert.match(source, /markets\(question, status, winning_outcome_id, last_synced_at\)/);
});
