import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

// Returns a map of eventId → total markets count for the given event ids.
// Used by the Saved page so EventBookmarkButton can render its 'partial'
// state when only some of an event's markets are saved.
export function useEventMarketCounts(eventIds: string[]) {
  const sortedKey = [...eventIds].sort();

  return useQuery({
    queryKey: ['event-market-counts', sortedKey],
    enabled: eventIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('markets')
        .select('event_id')
        .in('event_id', eventIds);
      if (error) throw new Error(error.message);
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const id = (row as { event_id: string | null }).event_id;
        if (id) counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    },
  });
}
