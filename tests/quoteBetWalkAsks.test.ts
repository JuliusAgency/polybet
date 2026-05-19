import test from 'node:test';
import assert from 'node:assert/strict';
import { walkAsks, serializeSide } from '../supabase/functions/quote-bet/walkAsks.ts';

test('walkAsks: single level full fill', () => {
  const r = walkAsks([{ price: '0.02', size: '5000' }], 100);
  assert.equal(r.partial, false);
  assert.equal(r.shares, 5000);
  assert.equal(r.filledStake, 100);
  assert.equal(r.avgPrice, 0.02);
  assert.equal(r.effectiveOdds, 50);
});

test('walkAsks: walks multiple levels with mixed prices', () => {
  // $30 fills 3000 shares at 0.01, $70 fills 3500 shares at 0.02 → 6500 total.
  const r = walkAsks(
    [
      { price: '0.01', size: '3000' },
      { price: '0.02', size: '5000' },
    ],
    100
  );
  assert.equal(r.partial, false);
  // Use approximate equality; floating point can introduce tiny error.
  assert.ok(Math.abs(r.shares - 6500) < 1e-6, `shares=${r.shares}`);
  assert.ok(Math.abs(r.filledStake - 100) < 1e-6, `filled=${r.filledStake}`);
});

test('walkAsks: partial fill when depth is insufficient', () => {
  const r = walkAsks([{ price: '0.01', size: '5000' }], 100);
  // Available depth = 0.01 * 5000 = $50, stake is $100 → partial.
  assert.equal(r.partial, true);
  assert.equal(r.shares, 5000);
  assert.equal(r.filledStake, 50);
});

test('walkAsks: empty asks → partial, zero shares', () => {
  const r = walkAsks([], 100);
  assert.equal(r.partial, true);
  assert.equal(r.shares, 0);
  assert.equal(r.filledStake, 0);
});

test('walkAsks: unsorted asks are normalized to ascending', () => {
  // Higher price first in input; walker must still take the cheapest first.
  const r = walkAsks(
    [
      { price: '0.05', size: '1000' },
      { price: '0.01', size: '1000' },
    ],
    20
  );
  // $10 fills all 1000 shares at 0.01, remaining $10 fills 200 @ 0.05.
  assert.equal(r.partial, false);
  assert.ok(Math.abs(r.shares - 1200) < 1e-6, `shares=${r.shares}`);
});

test('walkAsks: zero stake → partial, zero shares', () => {
  const r = walkAsks([{ price: '0.5', size: '100' }], 0);
  assert.equal(r.partial, true);
  assert.equal(r.shares, 0);
});

test('walkAsks: NaN or out-of-range levels are skipped', () => {
  const r = walkAsks(
    [
      { price: '0.01', size: 'abc' }, // NaN size — skip
      { price: '2', size: '1000' }, // price > 1 — skip
      { price: '-0.5', size: '1000' }, // negative — skip
      { price: '0.02', size: '5000' }, // valid
    ],
    50
  );
  assert.equal(r.partial, false);
  assert.ok(Math.abs(r.shares - 2500) < 1e-6, `shares=${r.shares}`);
});

test('serializeSide: asks ascending, truncated to top 10', () => {
  const levels = Array.from({ length: 15 }, (_, i) => ({
    price: ((i + 1) / 100).toString(),
    size: '100',
  }));
  const flat = serializeSide(levels, false);
  // 10 levels × 2 numbers per level = 20.
  assert.equal(flat.length, 20);
  // First price is the smallest.
  assert.equal(flat[0], 0.01);
  // Strictly ascending across pairs.
  for (let i = 2; i < flat.length; i += 2) {
    assert.ok(flat[i] > flat[i - 2], `prices not ascending at ${i}`);
  }
});

test('serializeSide: bids descending, truncated', () => {
  const levels = [
    { price: '0.6', size: '50' },
    { price: '0.4', size: '50' },
    { price: '0.8', size: '50' },
  ];
  const flat = serializeSide(levels, true);
  assert.equal(flat.length, 6);
  assert.equal(flat[0], 0.8);
  assert.equal(flat[2], 0.6);
  assert.equal(flat[4], 0.4);
});

test('serializeSide: filters out invalid levels', () => {
  const flat = serializeSide(
    [
      { price: 'oops', size: '100' },
      { price: '0.5', size: '0' },
      { price: '0.3', size: '20' },
    ],
    false
  );
  // Only the (0.3, 20) level survives.
  assert.deepEqual(flat, [0.3, 20]);
});
