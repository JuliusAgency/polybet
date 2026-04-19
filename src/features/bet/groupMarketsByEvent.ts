import type { Market, MarketEvent } from './useMarkets';

/**
 * A feed item is either a single standalone market (event_id is null or only child of its event)
 * or an event with multiple child markets rendered as a grouped card.
 */
export type FeedItem =
  | { type: 'market'; key: string; market: Market }
  | { type: 'event'; key: string; event: MarketEvent; markets: Market[] };

/**
 * Group consecutive markets by their parent event.
 *
 * Preserves the input order (which is cursor-sorted by markets.created_at DESC in useMarkets),
 * so the first occurrence of an event_id fixes the event's position in the feed.
 *
 * An event is rendered as a grouped card only when ≥ 2 child markets are in the feed.
 * A lone child is rendered as a standalone market card (same UX as pre-hierarchy markets).
 */
export function groupMarketsByEvent(markets: Market[]): FeedItem[] {
  const eventBuckets = new Map<string, { event: MarketEvent; markets: Market[]; order: number }>();
  const standaloneOrder: Array<{ type: 'market'; market: Market; order: number }> = [];

  markets.forEach((market, index) => {
    if (market.event && market.event_id) {
      const bucket = eventBuckets.get(market.event_id);
      if (bucket) {
        bucket.markets.push(market);
      } else {
        eventBuckets.set(market.event_id, {
          event: market.event,
          markets: [market],
          order: index,
        });
      }
    } else {
      standaloneOrder.push({ type: 'market', market, order: index });
    }
  });

  const items: Array<{ order: number; item: FeedItem }> = [];

  for (const { event, markets: children, order } of eventBuckets.values()) {
    if (children.length >= 2) {
      items.push({
        order,
        item: { type: 'event', key: `event:${event.id}`, event, markets: children },
      });
    } else {
      for (const m of children) {
        items.push({ order, item: { type: 'market', key: `market:${m.id}`, market: m } });
      }
    }
  }

  for (const entry of standaloneOrder) {
    items.push({
      order: entry.order,
      item: { type: 'market', key: `market:${entry.market.id}`, market: entry.market },
    });
  }

  items.sort((a, b) => a.order - b.order);
  return items.map((x) => x.item);
}
