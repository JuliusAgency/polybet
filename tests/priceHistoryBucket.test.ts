import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPriceHistoryRange,
  PRICE_HISTORY_WINDOWS,
  type PriceHistoryWindow,
} from '../src/features/bet/priceHistoryBucket.ts';

const NOW = new Date('2026-04-19T12:00:00.000Z');

test('bucket interval matches window tier', () => {
  const cases: Record<PriceHistoryWindow, string> = {
    '1H': '1 minute',
    '6H': '5 minutes',
    '1D': '15 minutes',
    '1W': '1 hour',
    '1M': '4 hours',
    ALL: '1 day',
  };
  for (const w of PRICE_HISTORY_WINDOWS) {
    const r = getPriceHistoryRange(w, NOW);
    assert.equal(r.bucket, cases[w]);
    assert.equal(r.until.getTime(), NOW.getTime());
  }
});

test('since is computed relative to now per window', () => {
  const one = getPriceHistoryRange('1H', NOW);
  assert.equal(NOW.getTime() - one.since.getTime(), 60 * 60 * 1000);

  const day = getPriceHistoryRange('1D', NOW);
  assert.equal(NOW.getTime() - day.since.getTime(), 24 * 60 * 60 * 1000);

  const week = getPriceHistoryRange('1W', NOW);
  assert.equal(NOW.getTime() - week.since.getTime(), 7 * 24 * 60 * 60 * 1000);
});

test('ALL window starts at epoch 0', () => {
  const all = getPriceHistoryRange('ALL', NOW);
  assert.equal(all.since.getTime(), 0);
});
