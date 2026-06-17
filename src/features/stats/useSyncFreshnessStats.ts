import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface SyncFreshnessStats {
  markets_open: number;
  markets_price_avg_seconds: number | null;
  events_open: number;
  events_sync_avg_seconds: number | null;
  computed_at: string;
}

/**
 * On-demand average data-freshness for markets/events (super-admin).
 *
 * Calls the get_sync_freshness_stats() RPC, which full-scans markets ⋈
 * market_outcomes and events (~1-2.5s). Because it is expensive it is NOT
 * polled: the query is disabled by default and only runs when the caller
 * invokes `run()` (a button). The lightweight liveness badge keeps using
 * useSyncHealth.
 */
export function useSyncFreshnessStats() {
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'sync-freshness-stats'],
    enabled: false,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<SyncFreshnessStats | null> => {
      const { data, error } = await supabase.rpc('get_sync_freshness_stats');

      if (error) {
        if (error.code === 'PGRST202' || /get_sync_freshness_stats/.test(error.message)) {
          return null;
        }
        throw new Error(error.message);
      }

      return (data ?? null) as SyncFreshnessStats | null;
    },
  });

  return {
    stats: data ?? null,
    isFetching,
    error: error instanceof Error ? error : null,
    run: () => {
      void refetch();
    },
  };
}
