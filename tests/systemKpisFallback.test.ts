import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/home/dmitriy/Projects/JuliusAgency/polybet/polybet';
const hookFile = path.join(projectRoot, 'src/features/stats/useSystemKpis.ts');

test('system kpis hook falls back when system_kpis view is missing', () => {
  const source = readFileSync(hookFile, 'utf8');

  assert.match(source, /error\.code === 'PGRST205'/);
  assert.match(source, /error\.code === '42P01'/);
  assert.match(source, /system_kpis/i);
  assert.match(source, /retry:\s*false/);
});
