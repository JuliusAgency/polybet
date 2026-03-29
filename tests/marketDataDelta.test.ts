import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarketCreatedDelta,
  buildMarketResolvedDelta,
  buildMarketStatusDelta,
  buildOutcomePriceDeltas,
} from '../supabase/functions/_shared/marketDataDelta.ts';

test('buildMarketStatusDelta returns null when status is unchanged', () => {
  const delta = buildMarketStatusDelta({
    marketId: 'm1',
    polymarketId: 'pm1',
    previousStatus: 'open',
    nextStatus: 'open',
    runId: 'run-1',
    changedAt: '2026-03-29T12:00:00.000Z',
  });

  assert.equal(delta, null);
});

test('buildMarketStatusDelta returns delta when status changes', () => {
  const delta = buildMarketStatusDelta({
    marketId: 'm1',
    polymarketId: 'pm1',
    previousStatus: 'open',
    nextStatus: 'closed',
    runId: 'run-1',
    changedAt: '2026-03-29T12:00:00.000Z',
  });

  assert.ok(delta);
  assert.equal(delta?.event_type, 'status_changed');
  assert.equal(delta?.old_value, 'open');
  assert.equal(delta?.new_value, 'closed');
});

test('buildOutcomePriceDeltas returns only changed outcomes', () => {
  const deltas = buildOutcomePriceDeltas({
    marketId: 'm1',
    polymarketId: 'pm1',
    runId: 'run-1',
    changedAt: '2026-03-29T12:00:00.000Z',
    existingByToken: new Map([
      ['tok-a', 0.4],
      ['tok-b', 0.6],
    ]),
    nextOutcomes: [
      { tokenId: 'tok-a', price: 0.55 },
      { tokenId: 'tok-b', price: 0.6 },
      { tokenId: 'tok-c', price: 0.1 },
    ],
  });

  assert.equal(deltas.length, 1);
  assert.equal(deltas[0]?.event_type, 'outcome_price_changed');
  assert.equal(deltas[0]?.polymarket_token_id, 'tok-a');
  assert.equal(deltas[0]?.old_value, '0.4');
  assert.equal(deltas[0]?.new_value, '0.55');
});

test('buildMarketResolvedDelta records final outcome transition', () => {
  const delta = buildMarketResolvedDelta({
    marketId: 'm1',
    polymarketId: 'pm1',
    runId: 'run-1',
    changedAt: '2026-03-29T12:00:00.000Z',
    previousWinningOutcomeId: null,
    winningOutcomeId: 'outcome-42',
  });

  assert.equal(delta.event_type, 'market_resolved');
  assert.equal(delta.old_value, null);
  assert.equal(delta.new_value, 'outcome-42');
});

test('buildMarketCreatedDelta stores initial market payload', () => {
  const delta = buildMarketCreatedDelta({
    marketId: 'm1',
    polymarketId: 'pm1',
    runId: 'run-1',
    changedAt: '2026-03-29T12:00:00.000Z',
    payload: { status: 'open', question: 'Will X happen?' },
  });

  assert.equal(delta.event_type, 'market_created');
  assert.equal(delta.old_value, null);
  assert.equal(delta.new_value, '{"status":"open","question":"Will X happen?"}');
});
