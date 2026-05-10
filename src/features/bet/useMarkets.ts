import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { MARKET_SELECT_FULL } from '@/shared/api/supabase/selects';
import { MARKETS_PAGE_LIMIT, MARKETS_REFRESH_MAX_IDS } from '@/shared/config/markets';
import type { Market, MarketStatusFilter } from '@/entities/market';
import {
  applyMarketStatusFilter,
  TRENDING_TAG_SLUG,
  CLOSING_TODAY_TAG_SLUG,
} from '@/entities/market';
import { useMarketRefresh } from './useMarketRefresh';

interface DefaultCursor {
  kind: 'default';
  lastSortVolume: number;
  lastCreatedAt: string;
  lastId: string;
}

interface TrendingCursor {
  kind: 'trending';
  // null trending_rank ranks last; we encode "ranked" pages first, then a
  // separate "unranked" stretch sorted by volume_24hr DESC.
  lastTrendingRank: number | null;
  lastVolume24hr: number | null;
  lastId: string;
}

type Cursor = DefaultCursor | TrendingCursor;

export function useMarkets(
  statusFilter: MarketStatusFilter = 'all',
  searchQuery = '',
  categoryFilter: string | null = null,
  tagSlugFilter: string | null = null
) {
  const queryKey = ['markets', statusFilter, searchQuery, categoryFilter, tagSlugFilter] as const;

  const result = useInfiniteQuery<
    Market[],
    Error,
    { pages: Market[][] },
    typeof queryKey,
    Cursor | undefined
  >({
    queryKey,
    initialPageParam: undefined,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ pageParam }) => {
      const isClosingTodayFilter = tagSlugFilter === CLOSING_TODAY_TAG_SLUG;
      // MARKET_SELECT_FULL includes tag_slugs (migration 069) and the event join.
      // tag_slugs is denormalized onto markets, so the tag filter applies directly
      // on markets without a nested loop join through events.
      let query = supabase
        .from('markets')
        .select(MARKET_SELECT_FULL)
        .eq('is_visible', true)
        // Canonical Yes/No ordering inside the embedded outcomes list.
        // See migration 20260510150927 — position 0 = Yes, 1 = No.
        .order('position', { referencedTable: 'market_outcomes', ascending: true });

      // For 'all' the IN covers the full status domain, which tricks the planner
      // into a Seq Scan. The shared helper skips the predicate so the planner
      // walks idx_markets_visible_feed.
      query = applyMarketStatusFilter(query, statusFilter, new Date());

      if (searchQuery.trim()) {
        query = query.ilike('question', `%${searchQuery.trim()}%`);
      }

      if (categoryFilter) {
        query = query.eq('category', categoryFilter);
      }

      if (tagSlugFilter && !isClosingTodayFilter) {
        // Array containment on the denormalized markets.tag_slugs column
        // (migration 069). Hits idx_markets_tag_slugs_visible (GIN) and
        // avoids the events nested loop that previously timed out under load.
        query = query.contains('tag_slugs', [tagSlugFilter]);
      }

      if (isClosingTodayFilter) {
        // Local-day bounds in ISO (timestamptz tolerates any offset). Include
        // the entire current day regardless of whether close_at already passed
        // earlier today — the list is a "closing today" agenda, not a
        // currently-tradable slice (statusFilter handles the latter).
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        query = query
          .gte('close_at', todayStart.toISOString())
          .lt('close_at', tomorrowStart.toISOString());
      }

      const isTrendingFilter = tagSlugFilter === TRENDING_TAG_SLUG;

      if (isTrendingFilter) {
        // Trending: order by Polymarket's curated rank first, then by 24h
        // volume (Bug 5). Cursor is (trending_rank ASC NULLS LAST,
        // volume_24hr DESC NULLS LAST, id DESC). PostgREST has no native
        // "nulls last" for the ordering used in keyset comparisons, so we
        // express NULL handling explicitly via the cursor branch.
        if (pageParam && pageParam.kind === 'trending') {
          const { lastTrendingRank: tr, lastVolume24hr: v24, lastId: i } = pageParam;
          if (tr != null) {
            // Within the ranked block: strictly greater rank (worse), or same
            // rank with smaller volume_24hr / id.
            query = query.or(
              `trending_rank.gt.${tr},` +
                `and(trending_rank.eq.${tr},volume_24hr.lt.${v24 ?? 0}),` +
                `and(trending_rank.eq.${tr},volume_24hr.eq.${v24 ?? 0},id.lt.${i}),` +
                `trending_rank.is.null`
            );
          } else {
            // Past the ranked block — staying in NULL-rank territory, sort
            // by volume_24hr DESC then id DESC.
            query = query
              .is('trending_rank', null)
              .or(`volume_24hr.lt.${v24 ?? 0},` + `and(volume_24hr.eq.${v24 ?? 0},id.lt.${i})`);
          }
        }

        query = query
          .order('trending_rank', { ascending: true, nullsFirst: false })
          .order('volume_24hr', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false })
          .limit(MARKETS_PAGE_LIMIT);
      } else {
        // Cursor: fetch rows after the last item of the previous page.
        // Sort key is (sort_volume DESC, created_at DESC, id DESC) — so "after"
        // means strictly less on the compound key (keyset pagination).
        if (pageParam && pageParam.kind === 'default') {
          const { lastSortVolume: v, lastCreatedAt: c, lastId: i } = pageParam;
          query = query.or(
            `sort_volume.lt.${v},` +
              `and(sort_volume.eq.${v},created_at.lt.${c}),` +
              `and(sort_volume.eq.${v},created_at.eq.${c},id.lt.${i})`
          );
        }

        query = query
          .order('sort_volume', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(MARKETS_PAGE_LIMIT);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const markets = (data ?? []) as unknown as Market[];
      if (import.meta.env.DEV && markets.length > 0) {
        console.log(
          '[useMarkets] queryFn fetched, first market last_synced_at:',
          markets[0].last_synced_at
        );
      }
      return markets;
    },
    getNextPageParam: (lastPage): Cursor | undefined => {
      if (lastPage.length < MARKETS_PAGE_LIMIT) return undefined;
      const last = lastPage[lastPage.length - 1];
      if (tagSlugFilter === TRENDING_TAG_SLUG) {
        return {
          kind: 'trending',
          lastTrendingRank: last.trending_rank ?? null,
          lastVolume24hr: last.volume_24hr ?? null,
          lastId: last.id,
        };
      }
      return {
        kind: 'default',
        lastSortVolume: last.sort_volume ?? 0,
        lastCreatedAt: last.created_at,
        lastId: last.id,
      };
    },
  });

  // Flatten all pages into a single array
  const markets = result.data?.pages.flat() ?? [];

  // Pass the first N polymarket IDs to the refresh hook
  const polymarketIds = markets.slice(0, MARKETS_REFRESH_MAX_IDS).map((m) => m.polymarket_id);

  const { isRefreshing } = useMarketRefresh(polymarketIds);

  return {
    markets,
    isLoading: result.isLoading,
    // True for any in-flight fetch — including refetch on a fully cached
    // queryKey. Used by the feed to flash the skeleton on every tab switch
    // (Bug 1: Trending had no loader because cached re-mounts had isLoading=false).
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    fetchNextPage: result.fetchNextPage,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
    isRefreshing,
  };
}
