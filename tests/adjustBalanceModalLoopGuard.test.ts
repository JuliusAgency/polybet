import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/home/dmitriy/Projects/JuliusAgency/polybet/polybet';
const modalFile = path.join(
  projectRoot,
  'src/features/manager/balance/components/AdjustBalanceModal/AdjustBalanceModal.tsx',
);

test('AdjustBalanceModal close-reset effect depends on isOpen only (prevents reset loop)', () => {
  const source = readFileSync(modalFile, 'utf8');

  assert.match(source, /\},\s*\[isOpen\]\);/);
  assert.doesNotMatch(source, /\},\s*\[isOpen,\s*mutation\]\);/);
});
