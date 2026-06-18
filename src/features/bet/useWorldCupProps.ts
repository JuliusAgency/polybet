import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { MARKET_SELECT_FULL } from '@/shared/api/supabase/selects';
import { MARKETS_REFRESH_INTERVAL_MS } from '@/shared/config/markets';
import { applyMarketStatusFilter } from '@/entities/market';
import type { Market, MarketStatusFilter } from '@/entities/market';
import { WORLD_CUP_TAG_SLUG } from '@/shared/config/worldCup';

// Events per page. The Props tab paginates by EVENT (not by market) on purpose:
// the generic markets feed (useMarkets) orders by event-level `sort_volume`, so
// every market of a single mega-event shares the top rank. "World Cup Winner"
// alone has ~48 open markets, which fill the entire first 50-row page and
// collapse the tab to 2 event cards. Paging by event guarantees one card per
// event and stops any single event from monopolizing a page. Keep this modest —
// phase 2 fetches every open market of each event on the page, and some events
// are large (Winner ~48, "Player to score" ~131).
const EVENTS_PER_PAGE = 20;

interface EventCursor {
  // Keyset on (volume DESC NULLS LAST, id DESC). volume can be null for events
  // that have not been assigned a rolled-up volume yet; they sort into the tail.
  lastVolume: number | null;
  lastId: string;
}

interface PropsPage {
  markets: Market[];
  nextCursor: EventCursor | null;
}

interface EventRow {
  id: string;
  volume: number | null;
}

/**
 * Keyset cursor for the next event page, or null when the event set is
 * exhausted. A page shorter than `pageSize` means no successor exists (the
 * query LIMITs to `pageSize`, so a short page is the tail). Exported pure for
 * unit testing.
 */
export function nextEventCursor(events: EventRow[], pageSize: number): EventCursor | null {
  if (events.length < pageSize) return null;
  const last = events[events.length - 1];
  return { lastVolume: last.volume, lastId: last.id };
}

/**
 * Return a NEW array of markets ordered by their parent event's position in
 * `orderedEventIds` (phase-1 volume order). Markets are stably ordered within an
 * event (preserving the query's outcome-position order) so groupMarketsByEvent
 * emits event cards in descending event volume. Exported pure for unit testing.
 */
export function orderMarketsByEvents(markets: Market[], orderedEventIds: string[]): Market[] {
  const orderIndex = new Map(orderedEventIds.map((id, idx) => [id, idx] as const));
  return [...markets].sort((a, b) => {
    const ea = orderIndex.get(a.event_id ?? '') ?? Number.MAX_SAFE_INTEGER;
    const eb = orderIndex.get(b.event_id ?? '') ?? Number.MAX_SAFE_INTEGER;
    return ea - eb;
  });
}

/**
 * World Cup "Props" feed: every `world-cup`-tagged OPEN event — tournament props
 * (Winner, Golden Boot, Group A–K Winners, Nation-to-reach-*, Player to score,
 * which-continent, …) AND individual matches — rendered one card per event,
 * ordered by event volume DESC.
 *
 * Two-phase, paginated BY EVENT (see EVENTS_PER_PAGE for why):
 *   1. a page of event ids (events tagged world-cup, status open) ordered by
 *      volume DESC, id DESC — keyset on (volume, id);
 *   2. all open, visible markets for those event ids (mirrors useEventsByIds),
 *      re-sorted to the phase-1 event order so groupMarketsByEvent emits cards
 *      in descending event volume.
 *
 * Returns a flat Market[] (with the event join populated) so the feed page can
 * reuse groupMarketsByEvent + EventCard exactly like the generic feed. Polls on
 * the same cadence as the rest of the markets feed so prices stay fresh without
 * realtime.
 */
export function useWorldCupProps(enabled: boolean, statusFilter: MarketStatusFilter) {
  const result = useInfiniteQuery<
    PropsPage,
    Error,
    { pages: PropsPage[] },
    readonly ['world-cup-props', MarketStatusFilter],
    EventCursor | undefined
  >({
    queryKey: ['world-cup-props', statusFilter],
    enabled,
    initialPageParam: undefined,
    staleTime: MARKETS_REFRESH_INTERVAL_MS,
    refetchInterval: MARKETS_REFRESH_INTERVAL_MS,
    queryFn: async ({ pageParam }): Promise<PropsPage> => {
      // Phase 1 — a page of world-cup events (scoped by the active status filter)
      // ordered by volume DESC, id DESC.
      let eventQuery = applyMarketStatusFilter(
        supabase.from('events').select('id, volume').contains('tag_slugs', [WORLD_CUP_TAG_SLUG]),
        statusFilter
      );

      if (pageParam) {
        const { lastVolume: v, lastId: i } = pageParam;
        if (v != null) {
          // Within the non-null block: strictly smaller volume, or same volume
          // with a smaller id, or anything in the null-volume tail (which sorts
          // last under NULLS LAST and only surfaces once non-null rows above are
          // exhausted, since the page is LIMIT-ed and volume-ordered).
          eventQuery = eventQuery.or(
            `volume.lt.${v},and(volume.eq.${v},id.lt.${i}),volume.is.null`
          );
        } else {
          // Past the non-null block — stay in the null-volume tail, id DESC.
          eventQuery = eventQuery.is('volume', null).lt('id', i);
        }
      }

      eventQuery = eventQuery
        .order('volume', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(EVENTS_PER_PAGE);

      const { data: eventRows, error: eventError } = await eventQuery;
      if (eventError) throw new Error(eventError.message);

      const events = (eventRows ?? []) as EventRow[];
      if (events.length === 0) return { markets: [], nextCursor: null };

      const eventIds = events.map((e) => e.id);

      // Phase 2 — visible markets for those events, scoped by the active status
      // filter (mirrors useEventsByIds). tag_slugs already constrained the events,
      // so the markets only need the visibility gate + status filter + the
      // canonical outcome ordering the cards rely on.
      const marketQuery = applyMarketStatusFilter(
        supabase
          .from('markets')
          .select(MARKET_SELECT_FULL)
          .in('event_id', eventIds)
          .eq('is_visible', true),
        statusFilter
      );
      const { data: marketRows, error: marketError } = await marketQuery.order('position', {
        referencedTable: 'market_outcomes',
        ascending: true,
      });

      if (marketError) throw new Error(marketError.message);

      // Re-sort markets into phase-1 event order so groupMarketsByEvent (which
      // fixes each event's position at its first market) emits cards in
      // descending event volume.
      const markets = orderMarketsByEvents((marketRows ?? []) as unknown as Market[], eventIds);

      return { markets, nextCursor: nextEventCursor(events, EVENTS_PER_PAGE) };
    },
    getNextPageParam: (lastPage): EventCursor | undefined => lastPage.nextCursor ?? undefined,
  });

  const markets = result.data?.pages.flatMap((p) => p.markets) ?? [];

  return {
    markets,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    fetchNextPage: result.fetchNextPage,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
  };
}
