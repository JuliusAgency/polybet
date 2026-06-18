import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { MARKET_SELECT_FULL } from '@/shared/api/supabase/selects';
import { MARKETS_PRICE_POLL_INTERVAL_MS } from '@/shared/config/markets';
import type { Market, MarketStatusFilter } from '@/entities/market';
import { applyMarketStatusFilter } from '@/entities/market';

/**
 * Fetches a fixed set of markets by id, applying the same status rules as
 * the main feed. Used by the "My bets" filter to guarantee every market a
 * user has bet on is shown, regardless of the main feed's pagination cursor
 * or tag filter. Pass `livePoll` to re-read prices at the fast cadence while the
 * view is on screen — these by-id sets aren't covered by the feed's poll.
 */
export function useMarketsByIds(
  ids: string[],
  statusFilter: MarketStatusFilter,
  enabled: boolean,
  livePoll = false
) {
  const sortedIds = [...ids].sort();

  return useQuery<Market[]>({
    queryKey: ['markets-by-ids', statusFilter, sortedIds],
    enabled: enabled && sortedIds.length > 0,
    staleTime: 60 * 1000,
    // Live-poll the DB at the fast cadence only while the view is active (the
    // market-tracker keeps market_outcomes ~1s fresh). Off → fetch on mount /
    // 60s staleTime only, so a prefetched-but-inactive set never background-polls.
    refetchInterval: livePoll ? MARKETS_PRICE_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      let query = supabase
        .from('markets')
        .select(MARKET_SELECT_FULL)
        .in('id', sortedIds)
        .order('position', { referencedTable: 'market_outcomes', ascending: true });

      // Mirror useMarkets status rules so open/closed tabs stay consistent.
      query = applyMarketStatusFilter(query, statusFilter);

      query = query
        .order('sort_volume', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Market[];
    },
  });
}
