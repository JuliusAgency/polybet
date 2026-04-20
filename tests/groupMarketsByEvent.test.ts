import test from 'node:test';
import assert from 'node:assert/strict';
import { groupMarketsByEvent } from '../src/features/bet/groupMarketsByEvent.ts';
import type { Market, MarketEvent, MarketOutcome } from '../src/features/bet/useMarkets.ts';

const defaultOutcome: MarketOutcome = {
  id: 'outcome-1',
  name: 'Yes',
  price: 0.5,
  odds: 2,
  effective_odds: 2,
  updated_at: '2026-01-01T00:00:00.000Z',
  polymarket_token_id: 'token-1',
};

function createEvent(id: string): MarketEvent {
  return {
    id,
    title: `Event ${id}`,
    description: null,
    category: 'Politics',
    image_url: null,
    close_at: null,
    status: 'open',
    volume: 1000,
    tag_slug: 'politics',
    tag_label: 'Politics',
  };
}

function createMarket(id: string, event: MarketEvent | null): Market {
  return {
    id,
    polymarket_id: `poly-${id}`,
    question: `Question ${id}`,
    status: 'open',
    winning_outcome_id: null,
    category: 'Politics',
    image_url: null,
    close_at: null,
    last_synced_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    volume: 100,
    sort_volume: 100,
    event_id: event?.id ?? null,
    group_label: null,
    event,
    market_outcomes: [defaultOutcome],
  };
}

test('groupMarketsByEvent keeps single-child events grouped as event items', () => {
  const singleEvent = createEvent('event-1');
  const multiEvent = createEvent('event-2');

  const items = groupMarketsByEvent([
    createMarket('market-1', singleEvent),
    createMarket('market-2', multiEvent),
    createMarket('market-3', multiEvent),
    createMarket('market-4', null),
  ]);

  assert.equal(items.length, 3);

  assert.equal(items[0]?.type, 'event');
  assert.equal(items[0]?.key, 'event:event-1');
  if (items[0]?.type !== 'event') {
    throw new Error('single-child event should render as an event item');
  }
  assert.equal(items[0].markets.length, 1);

  assert.equal(items[1]?.type, 'event');
  assert.equal(items[1]?.key, 'event:event-2');
  if (items[1]?.type !== 'event') {
    throw new Error('multi-child event should render as an event item');
  }
  assert.equal(items[1].markets.length, 2);

  assert.equal(items[2]?.type, 'market');
  assert.equal(items[2]?.key, 'market:market-4');
});
