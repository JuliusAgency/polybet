import { useCallback, useEffect } from 'react';
import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { MARKETS_PAGE_LIMIT, MARKETS_REFRESH_MAX_IDS } from '@/shared/config/markets';
import { useMarketRefresh } from './useMarketRefresh';

export type MarketStatusFilter = 'all' | 'open' | 'closed' | 'resolved' | 'archived';

type MarketStatus = 'open' | 'closed' | 'resolved' | 'archived';

const STATUS_MAP: Record<MarketStatusFilter, MarketStatus[]> = {
  all: ['open', 'closed', 'resolved', 'archived'],
  open: ['open'],
  closed: ['closed'],
  resolved: ['resolved'],
  archived: ['archived'],
};

export interface MarketOutcome {
  id: string;
  name: string;
  price: number | null;
  odds: number;
  effective_odds: number;
  updated_at: string;
  polymarket_token_id: string | null;
}

export interface Market {
  id: string;
  polymarket_id: string;
  question: string;
  status: 'open' | 'closed' | 'resolved' | 'archived';
  winning_outcome_id: string | null;
  category: string | null;
  image_url: string | null;
  close_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  volume?: number | null;
  market_outcomes: MarketOutcome[];
}

interface Cursor {
  lastCreatedAt: string;
  lastId: string;
}

export function useMarkets(
  statusFilter: MarketStatusFilter = 'all',
  searchQuery = '',
  categoryFilter: string | null = null
) {
  const queryClient = useQueryClient();
  const queryKey = ['markets', statusFilter, searchQuery, categoryFilter] as const;

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
      let query = supabase
        .from('markets')
        .select(
          'id, polymarket_id, question, status, winning_outcome_id, category, image_url, close_at, last_synced_at, created_at, volume, market_outcomes!market_outcomes_market_id_fkey(id, name, price, odds, effective_odds, updated_at, polymarket_token_id)'
        )
        .eq('is_visible', true);

      // For 'all' the IN covers the full status domain, which tricks the planner
      // into a Seq Scan. Skip the predicate so it walks idx_markets_visible_feed.
      if (statusFilter !== 'all') {
        query = query.in('status', STATUS_MAP[statusFilter]);
      }

      if (searchQuery.trim()) {
        query = query.ilike('question', `%${searchQuery.trim()}%`);
      }

      if (categoryFilter) {
        query = query.eq('category', categoryFilter);
      }

      // Cursor: fetch rows after the last item of the previous page
      if (pageParam) {
        query = query.or(
          `created_at.lt.${pageParam.lastCreatedAt},and(created_at.eq.${pageParam.lastCreatedAt},id.lt.${pageParam.lastId})`
        );
      }

      query = query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MARKETS_PAGE_LIMIT);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const markets = (data ?? []) as unknown as Market[];
      if (import.meta.env.DEV && markets.length > 0) {
        // eslint-disable-next-line no-console
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
      return { lastCreatedAt: last.created_at, lastId: last.id };
    },
  });

  // Flatten all pages into a single array
  const markets = result.data?.pages.flat() ?? [];

  // Realtime: patch the cached outcome in-place without invalidating pages (preserves cursor)
  const handleRealtimeChange = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const updated = payload.new;
      if (!updated || typeof updated !== 'object') return;
      const outcomeId = updated['id'] as string | undefined;
      const marketId = updated['market_id'] as string | undefined;
      if (!outcomeId || !marketId) return;

      queryClient.setQueriesData<InfiniteData<Market[]>>(
        { queryKey: ['markets'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((market) => {
                if (market.id !== marketId) return market;
                return {
                  ...market,
                  market_outcomes: market.market_outcomes.map((o) =>
                    o.id === outcomeId ? { ...o, ...(updated as Partial<MarketOutcome>) } : o
                  ),
                };
              })
            ),
          };
        }
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient]
  );

  useEffect(() => {
    const channel = supabase
      .channel('market_outcomes_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'market_outcomes' },
        handleRealtimeChange
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [handleRealtimeChange]);

  // Pass the first N polymarket IDs to the refresh hook
  const polymarketIds = markets.slice(0, MARKETS_REFRESH_MAX_IDS).map((m) => m.polymarket_id);

  const { isRefreshing } = useMarketRefresh(polymarketIds);

  return {
    markets,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    fetchNextPage: result.fetchNextPage,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
    isRefreshing,
  };
}
