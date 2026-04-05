import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invokeSupabaseFunction } from '@/shared/api/supabase/invokeSupabaseFunction';
import { MARKETS_REFRESH_INTERVAL_MS, MARKETS_REFRESH_MAX_IDS } from '@/shared/config/markets';

interface RefreshMarketsResponse {
  updated: number;
  settled: number;
  requested: number;
  timestamp: string;
}

/** Full-cycle sync for the given polymarket_ids: refreshes odds, updates market status,
 *  and settles resolved markets. Periodically auto-runs and can be triggered manually.
 *  Pass autoRefresh=false to disable the interval (manual-only mode for per-card buttons). */
export function useMarketRefresh(polymarketIds: string[], autoRefresh = true) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIdsRef = useRef<string[]>([]);

  activeIdsRef.current = polymarketIds.slice(0, MARKETS_REFRESH_MAX_IDS);

  const refresh = async () => {
    const ids = activeIdsRef.current;
    if (ids.length === 0) return;

    setIsRefreshing(true);
    try {
      await invokeSupabaseFunction<RefreshMarketsResponse>('refresh-markets', {
        method: 'POST',
        body: { market_ids: ids },
      });
      void queryClient.invalidateQueries({ queryKey: ['markets'] });
    } catch {
      // Silent — background operation, no user-visible error
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!autoRefresh || activeIdsRef.current.length === 0) return;

    timerRef.current = setInterval(() => {
      void refresh();
    }, MARKETS_REFRESH_INTERVAL_MS);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  return { isRefreshing, refresh };
}
