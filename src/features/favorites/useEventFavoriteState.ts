import { useFavoriteEvents } from './useFavoriteEvents';
import { useFavoriteMarkets } from './useFavoriteMarkets';
import { useEventMarketCounts } from '@/features/bet';

export type EventFavoriteState = 'none' | 'partial' | 'full';

interface UseEventFavoriteStateResult {
  state: EventFavoriteState;
  /** True iff the event itself has a row in user_favorite_events. */
  isEventFavorite: boolean;
}

/**
 * Aggregates the bookmark state for a single event, combining:
 *   - whether the event itself is in user_favorite_events, and
 *   - how many of the event's markets are in user_favorite_markets vs. its
 *     total visible+hidden market count (from the event_market_counts RPC).
 *
 * Resolves to `partial` only when at least one market is saved but not all
 * of them, and the event itself is not separately bookmarked.
 *
 * While the total-count query is loading we collapse to the binary
 * event-favorite state to avoid a partial→full flicker on first paint.
 */
export function useEventFavoriteState(eventId: string): UseEventFavoriteStateResult {
  const { favoriteEventSet } = useFavoriteEvents();
  const { favoritesByEvent } = useFavoriteMarkets();
  const { data: counts, isSuccess } = useEventMarketCounts([eventId]);

  const isEventFavorite = favoriteEventSet.has(eventId);
  const savedMarkets = favoritesByEvent.get(eventId) ?? 0;
  const totalMarkets = counts?.[eventId] ?? 0;

  if (isEventFavorite) {
    return { state: 'full', isEventFavorite };
  }

  if (savedMarkets === 0) {
    return { state: 'none', isEventFavorite };
  }

  if (!isSuccess || totalMarkets === 0) {
    // Total unknown — show partial (we already know at least one is saved
    // and the event row itself is not bookmarked).
    return { state: 'partial', isEventFavorite };
  }

  if (savedMarkets >= totalMarkets) {
    return { state: 'full', isEventFavorite };
  }

  return { state: 'partial', isEventFavorite };
}
