import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOpenExposure,
  calculateRealizedPnl,
  calculateTurnover,
  calculateWinRate,
  type BetLikeForStats,
} from '../src/features/stats/calculations.ts';

const sampleBets: BetLikeForStats[] = [
  { status: 'open', stake: 100, potential_payout: 260 },
  { status: 'won', stake: 50, potential_payout: 110 },
  { status: 'lost', stake: 40, potential_payout: 96 },
  { status: 'cancelled', stake: 20, potential_payout: 40 },
];

test('calculateOpenExposure returns payout minus stake only for open bets', () => {
  assert.equal(calculateOpenExposure(sampleBets), 160);
});

test('calculateTurnover sums stake for all bets', () => {
  assert.equal(calculateTurnover(sampleBets), 210);
});

test('calculateRealizedPnl uses won and lost bets only', () => {
  // won: 50 - 110 = -60
  // lost: +40
  assert.equal(calculateRealizedPnl(sampleBets), -20);
});

test('calculateWinRate uses settled bets only', () => {
  // settled: won + lost = 2, won = 1 => 50%
  assert.equal(calculateWinRate(sampleBets), 50);
  assert.equal(calculateWinRate([{ status: 'open', stake: 1, potential_payout: 2 }]), 0);
});
