import { describe, expect, it } from 'vitest';
import type { Market } from '@/entities/market';
import { nextEventCursor, orderMarketsByEvents } from '@/features/bet';

// Pure paging helpers behind the World Cup Props feed. The Props tab paginates
// BY EVENT so a single mega-event ("World Cup Winner" has ~48 open markets)
// cannot monopolize the volume-sorted page and collapse the tab to 2 cards.

// Minimal market stub — the ordering helper only reads `event_id`.
function marketOf(id: string, eventId: string | null): Market {
  return { id, event_id: eventId } as unknown as Market;
}

const PAGE_SIZE = 20;

describe('nextEventCursor', () => {
  it('returns the last event as the cursor when the page is full', () => {
    const events = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      id: `e${i}`,
      volume: 1000 - i,
    }));
    expect(nextEventCursor(events, PAGE_SIZE)).toEqual({
      lastVolume: 1000 - (PAGE_SIZE - 1),
      lastId: `e${PAGE_SIZE - 1}`,
    });
  });

  it('returns null on a short page (event set exhausted)', () => {
    const events = [
      { id: 'e0', volume: 500 },
      { id: 'e1', volume: 400 },
    ];
    expect(nextEventCursor(events, PAGE_SIZE)).toBeNull();
  });

  it('returns null for an empty page', () => {
    expect(nextEventCursor([], PAGE_SIZE)).toBeNull();
  });

  it('carries a null volume through the cursor (null-volume tail)', () => {
    const events = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      id: `e${i}`,
      volume: i === PAGE_SIZE - 1 ? null : 1000 - i,
    }));
    expect(nextEventCursor(events, PAGE_SIZE)).toEqual({
      lastVolume: null,
      lastId: `e${PAGE_SIZE - 1}`,
    });
  });
});

describe('orderMarketsByEvents', () => {
  it('orders markets by their parent event position (descending event volume order)', () => {
    // Event order by volume: A (highest), then B, then C.
    const ordered = ['A', 'B', 'C'];
    // Input arrives interleaved (PostgREST returns rows in no event order).
    const markets = [
      marketOf('c1', 'C'),
      marketOf('a1', 'A'),
      marketOf('b1', 'B'),
      marketOf('a2', 'A'),
    ];
    const result = orderMarketsByEvents(markets, ordered);
    expect(result.map((m) => m.id)).toEqual(['a1', 'a2', 'b1', 'c1']);
  });

  it('keeps markets of the same event in input order (stable — preserves outcome position)', () => {
    const markets = [marketOf('a1', 'A'), marketOf('a2', 'A'), marketOf('a3', 'A')];
    const result = orderMarketsByEvents(markets, ['A']);
    expect(result.map((m) => m.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('sinks markets whose event is not on the page to the end', () => {
    const markets = [marketOf('x1', 'UNKNOWN'), marketOf('a1', 'A')];
    const result = orderMarketsByEvents(markets, ['A']);
    expect(result.map((m) => m.id)).toEqual(['a1', 'x1']);
  });

  it('does not mutate the input array', () => {
    const markets = [marketOf('b1', 'B'), marketOf('a1', 'A')];
    const snapshot = markets.map((m) => m.id);
    orderMarketsByEvents(markets, ['A', 'B']);
    expect(markets.map((m) => m.id)).toEqual(snapshot);
  });
});
