import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

const SYNC_HEALTH_REFETCH_INTERVAL_MS = 60_000;

// Books staler than this mean the live writer (market-tracker) is likely down.
// market-tracker writes market_outcome_books ~1/s while healthy, so 5 minutes
// is well past any transient lag or DB-load blip.
export const SYNC_STALE_THRESHOLD_SECONDS = 5 * 60;

export interface SyncHealth {
  books_latest_at: string | null;
  books_stale_seconds: number | null;
  last_run_status: string | null;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  checked_at: string;
}

/**
 * Super-admin sync-freshness probe. Calls the get_sync_health() RPC (super-admin
 * gated, SECURITY DEFINER) and exposes whether the Polymarket sync is fresh.
 * `isStale` is derived from the book write recency: null/over-threshold means
 * the live writer has likely stopped.
 */
export function useSyncHealth() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'sync-health'],
    refetchInterval: SYNC_HEALTH_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<SyncHealth | null> => {
      const { data, error } = await supabase.rpc('get_sync_health');

      if (error) {
        // Prod/local DB can be behind migrations and miss this RPC. Keep the
        // dashboard usable (badge shows "unknown") until migrations are applied.
        if (error.code === 'PGRST202' || /get_sync_health/.test(error.message)) {
          return null;
        }
        throw new Error(error.message);
      }

      return (data ?? null) as SyncHealth | null;
    },
    retry: false,
  });

  const staleSeconds = data?.books_stale_seconds ?? null;
  const isStale = staleSeconds === null || staleSeconds > SYNC_STALE_THRESHOLD_SECONDS;

  return {
    health: data ?? null,
    staleSeconds,
    isStale,
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
