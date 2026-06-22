import type { Market } from '@/entities/market';

/**
 * Build the deduped list for a Saved-markets view.
 *
 * Drops any standalone-favourited market whose parent event is ALSO
 * event-favourited — otherwise the same market surfaces twice (as a standalone
 * card AND inside the event card preview), and toggling the bookmark on the
 * duplicated market doesn't appear to remove it because the parent-event row
 * keeps the market visible until the event itself is unsaved.
 *
 * Event markets come first so grouped event cards lead the saved feed.
 */
export function dedupeSavedMarkets(
  savedEventMarkets: Market[],
  savedStandaloneMarkets: Market[],
  favoriteEventSet: Set<string>
): Market[] {
  const standaloneFiltered = savedStandaloneMarkets.filter(
    (m) => !m.event_id || !favoriteEventSet.has(m.event_id)
  );
  return [...savedEventMarkets, ...standaloneFiltered];
}
