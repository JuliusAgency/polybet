import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

// Returns a map of eventId → total markets count for the given event ids.
// Used by EventBookmarkButton to render its 'partial' state when only some
// of an event's markets are saved.
//
// Calls the SECURITY DEFINER RPC `event_market_counts` (migration 074) to
// bypass the "is_visible = true" RLS on `markets` — otherwise hidden /
// archived markets are missing from the count and state collapses to 'all'.
export function useEventMarketCounts(eventIds: string[]) {
  const sortedKey = [...eventIds].sort();

  return useQuery({
    queryKey: ['event-market-counts', sortedKey],
    enabled: eventIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc('event_market_counts', {
        p_event_ids: eventIds,
      });
      if (error) throw new Error(error.message);
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ event_id: string; market_count: number }>) {
        counts[row.event_id] = Number(row.market_count);
      }
      return counts;
    },
  });
}
