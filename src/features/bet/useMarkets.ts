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

export interface MarketEvent {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  close_at: string | null;
  status: 'open' | 'closed' | 'resolved' | 'archived';
  volume?: number | null;
  tag_slug: string | null;
  tag_label: string | null;
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
  sort_volume?: number | null;
  event_id: string | null;
  group_label: string | null;
  event: MarketEvent | null;
  market_outcomes: MarketOutcome[];
}

interface Cursor {
  lastSortVolume: number;
  lastCreatedAt: string;
  lastId: string;
}

export function useMarkets(
  statusFilter: MarketStatusFilter = 'all',
  searchQuery = '',
  categoryFilter: string | null = null,
  tagSlugFilter: string | null = null
) {
  const queryClient = useQueryClient();
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
      // When filtering by tag we need an inner join on events so the eq()
      // applies as a SQL-level filter (not a post-fetch client trim). The
      // default left join keeps standalone legacy markets visible.
      const eventJoin = tagSlugFilter
        ? 'event:event_id!inner(id, title, description, category, image_url, close_at, status, volume, tag_slug, tag_label)'
        : 'event:event_id(id, title, description, category, image_url, close_at, status, volume, tag_slug, tag_label)';

      let query = supabase
        .from('markets')
        .select(
          `id, polymarket_id, question, status, winning_outcome_id, category, image_url, close_at, last_synced_at, created_at, volume, sort_volume, event_id, group_label, ${eventJoin}, market_outcomes!market_outcomes_market_id_fkey(id, name, price, odds, effective_odds, updated_at, polymarket_token_id)`
        )
        .eq('is_visible', true);

      // For 'all' the IN covers the full status domain, which tricks the planner
      // into a Seq Scan. Skip the predicate so it walks idx_markets_visible_feed.
      // For 'open'/'closed' we also align with the UI's effectiveStatus rule:
      // a market with status='open' but close_at in the past renders as closed.
      if (statusFilter === 'open') {
        const nowIso = new Date().toISOString();
        query = query.eq('status', 'open').or(`close_at.is.null,close_at.gt.${nowIso}`);
      } else if (statusFilter === 'closed') {
        const nowIso = new Date().toISOString();
        query = query.or(`status.eq.closed,and(status.eq.open,close_at.lte.${nowIso})`);
      } else if (statusFilter !== 'all') {
        query = query.in('status', STATUS_MAP[statusFilter]);
      }

      if (searchQuery.trim()) {
        query = query.ilike('question', `%${searchQuery.trim()}%`);
      }

      if (categoryFilter) {
        query = query.eq('category', categoryFilter);
      }

      if (tagSlugFilter) {
        query = query.eq('event.tag_slug', tagSlugFilter);
      }

      // Cursor: fetch rows after the last item of the previous page.
      // Sort key is (sort_volume DESC, created_at DESC, id DESC) — so "after"
      // means strictly less on the compound key (keyset pagination).
      if (pageParam) {
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
      return {
        lastSortVolume: last.sort_volume ?? 0,
        lastCreatedAt: last.created_at,
        lastId: last.id,
      };
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

      queryClient.setQueriesData<InfiniteData<Market[]>>({ queryKey: ['markets'] }, (old) => {
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
      });
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
