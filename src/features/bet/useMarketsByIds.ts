import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { MARKET_SELECT_FULL } from '@/shared/api/supabase/selects';
import type { Market, MarketStatusFilter } from '@/entities/market';
import { applyMarketStatusFilter } from '@/entities/market';

/**
 * Fetches a fixed set of markets by id, applying the same status rules as
 * the main feed. Used by the "My bets" filter to guarantee every market a
 * user has bet on is shown, regardless of the main feed's pagination cursor
 * or tag filter.
 */
export function useMarketsByIds(ids: string[], statusFilter: MarketStatusFilter, enabled: boolean) {
  const sortedIds = [...ids].sort();

  return useQuery<Market[]>({
    queryKey: ['markets-by-ids', statusFilter, sortedIds],
    enabled: enabled && sortedIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      let query = supabase.from('markets').select(MARKET_SELECT_FULL).in('id', sortedIds);

      // Mirror useMarkets status rules so open/closed tabs stay consistent.
      query = applyMarketStatusFilter(query, statusFilter, new Date());

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
