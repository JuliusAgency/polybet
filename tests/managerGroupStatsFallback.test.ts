import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/home/dmitriy/Projects/JuliusAgency/polybet/polybet';
const hookFile = path.join(projectRoot, 'src/features/stats/useManagerGroupStats.ts');

test('manager group stats hook falls back when manager_group_metrics view is missing', () => {
  const source = readFileSync(hookFile, 'utf8');

  assert.match(source, /error\.code === 'PGRST205'/);
  assert.match(source, /error\.code === '42P01'/);
  assert.match(source, /manager_group_metrics/i);
  assert.match(source, /retry:\s*false/);
});
