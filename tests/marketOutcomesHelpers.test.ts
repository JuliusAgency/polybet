import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getYesOutcome,
  getNoOutcome,
  getOrderedOutcomes,
  getYesProbability,
  getResolvedWinnerOutcome,
  isBinaryMarket,
  sortMarketsByYesDesc,
} from '../src/entities/market/outcomes';
import type { Market, MarketOutcome } from '../src/entities/market/types';

const outcome = (overrides: Partial<MarketOutcome>): MarketOutcome => ({
  id: 'oc-' + Math.random().toString(36).slice(2),
  name: 'Yes',
  price: 0.5,
  odds: 2,
  effective_odds: 2,
  updated_at: '2026-05-10T00:00:00Z',
  polymarket_token_id: 't',
  ...overrides,
});

const market = (overrides: Partial<Market> & { market_outcomes: MarketOutcome[] }): Market => ({
  id: 'm-' + Math.random().toString(36).slice(2),
  polymarket_id: 'pm',
  question: 'q',
  status: 'open',
  winning_outcome_id: null,
  category: null,
  image_url: null,
  close_at: null,
  last_synced_at: null,
  created_at: '2026-05-10T00:00:00Z',
  event_id: null,
  group_label: null,
  event: null,
  ...overrides,
});

test('getYesOutcome finds Yes regardless of array order (case-insensitive)', () => {
  const yes = outcome({ name: 'Yes', price: 0.7 });
  const no = outcome({ name: 'No', price: 0.3 });

  assert.equal(getYesOutcome(market({ market_outcomes: [no, yes] })), yes);
  assert.equal(getYesOutcome(market({ market_outcomes: [yes, no] })), yes);

  const upper = outcome({ name: 'YES', price: 0.6 });
  assert.equal(getYesOutcome(market({ market_outcomes: [outcome({ name: 'NO' }), upper] })), upper);
});

test('getNoOutcome handles common negative aliases', () => {
  const no = outcome({ name: ' no ', price: 0.99 });
  const yes = outcome({ name: 'yes', price: 0.01 });
  assert.equal(getNoOutcome(market({ market_outcomes: [no, yes] })), no);
});

test('getResolvedWinnerOutcome only returns a winner once the market is resolved', () => {
  const yes = outcome({ name: 'Yes', price: 0.007 });
  const no = outcome({ name: 'No', price: 0.993 });
  const outcomes = [yes, no];

  // Open market carrying a stray winning_outcome_id must NOT surface a winner —
  // otherwise its pill renders the elevated winner tint while still tradable.
  assert.equal(
    getResolvedWinnerOutcome(
      market({ status: 'open', winning_outcome_id: no.id, market_outcomes: outcomes })
    ),
    null
  );

  // Resolved / archived markets do surface the winner.
  assert.equal(
    getResolvedWinnerOutcome(
      market({ status: 'resolved', winning_outcome_id: no.id, market_outcomes: outcomes })
    ),
    no
  );
  assert.equal(
    getResolvedWinnerOutcome(
      market({ status: 'archived', winning_outcome_id: no.id, market_outcomes: outcomes })
    ),
    no
  );

  // Resolved with no recorded winner stays null.
  assert.equal(
    getResolvedWinnerOutcome(
      market({ status: 'resolved', winning_outcome_id: null, market_outcomes: outcomes })
    ),
    null
  );
});

test('getOrderedOutcomes always returns [Yes, No] for binary markets', () => {
  const yes = outcome({ name: 'Yes', price: 0.7 });
  const no = outcome({ name: 'No', price: 0.3 });
  const ordered = getOrderedOutcomes(market({ market_outcomes: [no, yes] }));
  assert.deepEqual(
    ordered.map((o) => o.name),
    ['Yes', 'No']
  );
});

test('getOrderedOutcomes falls back to source order for non-binary markets', () => {
  const a = outcome({ name: 'A' });
  const b = outcome({ name: 'B' });
  const c = outcome({ name: 'C' });
  const ordered = getOrderedOutcomes(market({ market_outcomes: [a, b, c] }));
  assert.deepEqual(ordered, [a, b, c]);
});

test('getOrderedOutcomes falls back when binary names are unknown (defensive)', () => {
  const long = outcome({ name: 'Long' });
  const exotic = outcome({ name: 'Maybe' });
  const ordered = getOrderedOutcomes(market({ market_outcomes: [long, exotic] }));
  // Yes alias 'long' matches but 'Maybe' doesn't match 'no' aliases —
  // helper bails to source order so callers still render *something*.
  assert.deepEqual(ordered, [long, exotic]);
});

test('isBinaryMarket counts outcomes only', () => {
  assert.equal(isBinaryMarket(market({ market_outcomes: [outcome({}), outcome({})] })), true);
  assert.equal(
    isBinaryMarket(market({ market_outcomes: [outcome({}), outcome({}), outcome({})] })),
    false
  );
});

test('getYesProbability returns the Yes-side price', () => {
  const yes = outcome({ name: 'Yes', price: 0.42 });
  const no = outcome({ name: 'No', price: 0.58 });
  assert.equal(getYesProbability(market({ market_outcomes: [no, yes] })), 0.42);
  assert.equal(getYesProbability(market({ market_outcomes: [no] })), null);
});

test('sortMarketsByYesDesc orders by yes-price desc, stable for ties / nulls last', () => {
  const a = market({
    id: 'A',
    market_outcomes: [outcome({ name: 'Yes', price: 0.45 }), outcome({ name: 'No', price: 0.55 })],
  });
  const b = market({
    id: 'B',
    market_outcomes: [outcome({ name: 'Yes', price: 0.13 }), outcome({ name: 'No', price: 0.87 })],
  });
  const c = market({
    id: 'C',
    market_outcomes: [outcome({ name: 'Yes', price: 0.45 }), outcome({ name: 'No', price: 0.55 })],
  });
  const noPrice = market({
    id: 'N',
    market_outcomes: [outcome({ name: 'Yes', price: null }), outcome({ name: 'No', price: null })],
  });

  const sorted = sortMarketsByYesDesc([b, a, noPrice, c]);
  assert.deepEqual(
    sorted.map((m) => m.id),
    ['A', 'C', 'B', 'N'] // ties keep input order; null sinks to bottom.
  );
});
