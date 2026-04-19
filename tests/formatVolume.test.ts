import test from 'node:test';
import assert from 'node:assert/strict';
import { formatVolume } from '../src/shared/utils/formatVolume.ts';

test('formatVolume: returns null for null/undefined/zero/negative', () => {
  assert.equal(formatVolume(null), null);
  assert.equal(formatVolume(undefined), null);
  assert.equal(formatVolume(0), null);
  assert.equal(formatVolume(-100), null);
  assert.equal(formatVolume(Number.NaN), null);
});

test('formatVolume: compact thousands', () => {
  assert.equal(formatVolume(1_200), '$1.2K');
  assert.equal(formatVolume(950), '$950');
});

test('formatVolume: millions and billions', () => {
  assert.equal(formatVolume(17_000_000), '$17M');
  assert.equal(formatVolume(1_250_000_000), '$1.3B');
});
