/**
 * Deep link to a market on Polymarket. Event pages live at /event/{eventSlug};
 * a market inside a multi-market event is /event/{eventSlug}/{marketSlug}.
 * The market segment is appended only when it exists and differs from the
 * event slug — single-market events reuse the event slug, and /a/a would 404.
 */
export function polymarketMarketUrl(eventSlug: string, marketSlug?: string | null): string {
  const base = `https://polymarket.com/event/${encodeURIComponent(eventSlug)}`;
  return marketSlug && marketSlug !== eventSlug
    ? `${base}/${encodeURIComponent(marketSlug)}`
    : base;
}
