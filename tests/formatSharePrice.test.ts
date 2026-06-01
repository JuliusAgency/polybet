import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSharePrice } from '../src/shared/utils/formatSharePrice.ts';

test('formatSharePrice: invalid inputs render dash', () => {
  assert.equal(formatSharePrice(null), '–');
  assert.equal(formatSharePrice(undefined), '–');
  assert.equal(formatSharePrice(Number.NaN), '–');
  assert.equal(formatSharePrice(Number.POSITIVE_INFINITY), '–');
});

test('formatSharePrice: whole-cent values drop the trailing .0', () => {
  assert.equal(formatSharePrice(0.71), '71¢');
  assert.equal(formatSharePrice(0.3), '30¢');
  assert.equal(formatSharePrice(0.5), '50¢');
});

test('formatSharePrice: fractional cents keep one decimal', () => {
  assert.equal(formatSharePrice(0.083), '8.3¢');
  assert.equal(formatSharePrice(0.005), '0.5¢');
});

test('formatSharePrice: clamps to [0, 1]', () => {
  assert.equal(formatSharePrice(1.5), '100¢');
  assert.equal(formatSharePrice(-0.2), '0¢');
});
