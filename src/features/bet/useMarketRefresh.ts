import { useEffect, useRef, useState } from 'react';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { invokeSupabaseFunction } from '@/shared/api/supabase/invokeSupabaseFunction';
import { MARKETS_REFRESH_INTERVAL_MS, MARKETS_REFRESH_MAX_IDS } from '@/shared/config/markets';
import type { Market } from './useMarkets';

interface RefreshMarketsResponse {
  updated: number;
  settled: number;
  requested: number;
  timestamp: string;
  errors?: string[];
}

export type RefreshResult = 'idle' | 'ok' | 'failed';

/** Full-cycle sync for the given polymarket_ids: refreshes odds, updates market status,
 *  and settles resolved markets. Periodically auto-runs and can be triggered manually.
 *  Pass autoRefresh=false to disable the interval (manual-only mode for per-card buttons). */
export function useMarketRefresh(polymarketIds: string[], autoRefresh = true) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastResult, setLastResult] = useState<RefreshResult>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIdsRef = useRef<string[]>([]);
  const refreshingRef = useRef(false);

  const slicedIds = polymarketIds.slice(0, MARKETS_REFRESH_MAX_IDS);
  activeIdsRef.current = slicedIds;
  const hasIds = slicedIds.length > 0;

  const refresh = async () => {
    const ids = activeIdsRef.current;
    if (ids.length === 0 || refreshingRef.current) return;

    refreshingRef.current = true;
    setIsRefreshing(true);
    setLastResult('idle');
    try {
      const { data, error } = await invokeSupabaseFunction<RefreshMarketsResponse>(
        'refresh-markets',
        {
          method: 'POST',
          body: { market_ids: ids },
        }
      );

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[useMarketRefresh] edge response', {
          ids,
          updated: data?.updated,
          requested: data?.requested,
          errors: data?.errors,
          error,
        });
      }

      // Fetch fresh data only for the refreshed market IDs and patch cache in-place.
      // Avoids invalidating all pages so the cursor stays intact during infinite scroll.
      if (data && data.updated > 0) {
        const { data: freshMarkets } = await supabase
          .from('markets')
          .select(
            'id, polymarket_id, question, status, winning_outcome_id, category, image_url, close_at, last_synced_at, created_at, volume, market_outcomes!market_outcomes_market_id_fkey(id, name, price, odds, effective_odds, updated_at, polymarket_token_id)'
          )
          .in('polymarket_id', ids);

        if (freshMarkets && freshMarkets.length > 0) {
          const freshById = Object.fromEntries(freshMarkets.map((m) => [m.id, m]));
          queryClient.setQueriesData<InfiniteData<Market[]>>(
            { queryKey: ['markets'] },
            (old) => {
              if (!old) return old;
              return {
                ...old,
                pages: old.pages.map((page) =>
                  page.map((market) => freshById[market.id] ?? market)
                ),
              };
            }
          );
        }
      }

      const result: RefreshResult = data && data.updated > 0 ? 'ok' : 'failed';
      setLastResult(result);

      // Reset result indicator after 4 seconds
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      resultTimerRef.current = setTimeout(() => setLastResult('idle'), 4_000);
    } catch (err) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[useMarketRefresh] CAUGHT error:', err);
      }
      setLastResult('failed');
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      resultTimerRef.current = setTimeout(() => setLastResult('idle'), 4_000);
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!autoRefresh || !hasIds) return;

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
  }, [autoRefresh, hasIds]);

  return { isRefreshing, lastResult, refresh };
}
