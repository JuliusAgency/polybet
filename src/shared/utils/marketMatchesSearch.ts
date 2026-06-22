import type { Market } from '@/entities/market';

/**
 * Client-side search predicate for by-id feeds (Saved / My bets) which are
 * fetched without the server's `question` ilike. Mirrors that question match and
 * additionally matches the parent event's title so an event card is findable by
 * its own label, not only its sub-market questions. An empty query matches all.
 */
export function marketMatchesSearch(market: Market, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (market.question.toLowerCase().includes(needle)) return true;
  return market.event?.title.toLowerCase().includes(needle) ?? false;
}
