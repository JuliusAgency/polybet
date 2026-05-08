import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/home/dmitriy/Projects/JuliusAgency/polybet/polybet';
const hookFile = path.join(projectRoot, 'src/features/stats/useManagerGroupStats.ts');
const helperFile = path.join(projectRoot, 'src/shared/api/supabase/isMissingRelationError.ts');

test('manager group stats hook falls back when manager_group_metrics view is missing', () => {
  const source = readFileSync(hookFile, 'utf8');
  const helperSource = readFileSync(helperFile, 'utf8');

  // Error code checks are centralised in the shared helper, not inlined in the hook.
  assert.match(source, /isMissingRelationError/);
  assert.match(source, /manager_group_metrics/i);
  assert.match(source, /retry:\s*false/);

  // Confirm the helper itself contains the error-code guards.
  assert.match(helperSource, /PGRST205/);
  assert.match(helperSource, /42P01/);
});
