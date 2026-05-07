import test from 'node:test';
import assert from 'node:assert/strict';
import { formatProbability } from '../src/shared/utils/formatProbability.ts';

test('formatProbability: invalid inputs render dash', () => {
  assert.equal(formatProbability(null), '–');
  assert.equal(formatProbability(undefined), '–');
  assert.equal(formatProbability(Number.NaN), '–');
  assert.equal(formatProbability(Number.POSITIVE_INFINITY), '–');
});

test('formatProbability: exact 0 and 1 render as integer percent', () => {
  assert.equal(formatProbability(0), '0%');
  assert.equal(formatProbability(1), '100%');
});

test('formatProbability: tiny non-zero value rendered as <1% (not 0%)', () => {
  assert.equal(formatProbability(0.001), '<1%');
  assert.equal(formatProbability(0.0049), '<1%');
});

test('formatProbability: near-100 value rendered as >99% (not 100%)', () => {
  assert.equal(formatProbability(0.996), '>99%');
  assert.equal(formatProbability(0.9999), '>99%');
});

test('formatProbability: typical decimals show one fraction digit', () => {
  assert.equal(formatProbability(0.473), '47.3%');
  assert.equal(formatProbability(0.628), '62.8%');
});

test('formatProbability: trailing .0 stripped', () => {
  assert.equal(formatProbability(0.5), '50%');
  assert.equal(formatProbability(0.25), '25%');
});

test('formatProbability: value beyond [0,1] is clamped', () => {
  assert.equal(formatProbability(1.5), '100%');
  assert.equal(formatProbability(-0.2), '0%');
});
