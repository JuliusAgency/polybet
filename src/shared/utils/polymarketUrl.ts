/**
 * Builds the canonical public Polymarket market/event page URL from a slug.
 * Polymarket serves market pages at https://polymarket.com/event/{slug}.
 */
export function polymarketEventUrl(slug: string): string {
  return `https://polymarket.com/event/${encodeURIComponent(slug)}`;
}
