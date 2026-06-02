import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { MARKET_SELECT_FULL } from '@/shared/api/supabase/selects';
import type { Market, MarketStatusFilter } from '@/entities/market';
import { applyMarketStatusFilter } from '@/entities/market';

/**
 * Fetches all markets that belong to the given events. Used by the Saved page
 * to render saved events as standard event cards (top-N rows preview), instead
 * of fetching only the markets the user previously toggled inside the event.
 */
export function useEventsByIds(
  eventIds: string[],
  statusFilter: MarketStatusFilter,
  enabled: boolean
) {
  const sortedEventIds = [...eventIds].sort();

  return useQuery<Market[]>({
    queryKey: ['markets-by-event-ids', statusFilter, sortedEventIds],
    enabled: enabled && sortedEventIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      let query = supabase
        .from('markets')
        .select(MARKET_SELECT_FULL)
        .in('event_id', sortedEventIds)
        .order('position', { referencedTable: 'market_outcomes', ascending: true });

      // Mirror useMarkets status rules for consistency between feed and saved.
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
