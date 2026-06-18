import { useEffect, useRef, useState } from 'react';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { invokeSupabaseFunction } from '@/shared/api/supabase/invokeSupabaseFunction';
import { MARKET_SELECT_FULL } from '@/shared/api/supabase/selects';
import {
  MARKETS_PRICE_POLL_INTERVAL_MS,
  MARKETS_REFRESH_INTERVAL_MS,
  MARKETS_REFRESH_MAX_IDS,
} from '@/shared/config/markets';
import type { Market } from '@/entities/market';

interface RefreshMarketsResponse {
  updated: number;
  settled: number;
  requested: number;
  timestamp: string;
  errors?: string[];
}

type RefreshResult = 'idle' | 'ok' | 'failed';

interface UseMarketRefreshOptions {
  /** Disable the interval (manual-only mode for per-card buttons). */
  autoRefresh?: boolean;
  /** When set, after a successful refresh invalidate exactly `['event', eventId]`
   *  so the EventDetail query refetches fresh prices without a 30s lag.
   *  Omit on the feed page where there is no event in scope — broadcasting an
   *  invalidation across all `['event', *]` cache entries would refetch every
   *  warm event query unnecessarily. */
  eventId?: string;
}

/** Full-cycle sync for the given polymarket_ids: refreshes odds, updates market status,
 *  and settles resolved markets. Periodically auto-runs and can be triggered manually. */
export function useMarketRefresh(
  polymarketIds: string[],
  optionsOrAutoRefresh: UseMarketRefreshOptions | boolean = true
) {
  const options: UseMarketRefreshOptions =
    typeof optionsOrAutoRefresh === 'boolean'
      ? { autoRefresh: optionsOrAutoRefresh }
      : optionsOrAutoRefresh;
  const autoRefresh = options.autoRefresh ?? true;
  const eventId = options.eventId;

  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastResult, setLastResult] = useState<RefreshResult>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIdsRef = useRef<string[]>([]);
  const eventIdRef = useRef<string | undefined>(eventId);
  const refreshingRef = useRef(false);

  const slicedIds = polymarketIds.slice(0, MARKETS_REFRESH_MAX_IDS);
  activeIdsRef.current = slicedIds;
  eventIdRef.current = eventId;
  const hasIds = slicedIds.length > 0;

  // Cheap DB read of fresh prices for the on-screen markets, patched into the
  // ['markets'] cache in place (cursor preserved). market_outcomes is kept ~1s
  // fresh by the market-tracker (CLOB websocket), so this indexed `IN (…)` read —
  // not the edge Gamma fetch — is what drives the feed's fast price updates.
  const patchVisibleFromDb = async () => {
    const ids = activeIdsRef.current;
    if (ids.length === 0) return;

    const { data: freshMarkets } = await supabase
      .from('markets')
      .select(MARKET_SELECT_FULL)
      .in('polymarket_id', ids)
      .order('position', { referencedTable: 'market_outcomes', ascending: true });

    if (freshMarkets && freshMarkets.length > 0) {
      const freshById = Object.fromEntries(freshMarkets.map((m) => [m.id, m]));
      queryClient.setQueriesData<InfiniteData<Market[]>>({ queryKey: ['markets'] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => page.map((market) => freshById[market.id] ?? market)),
        };
      });
    }

    // On the bet page, nudge the exact EventDetail query so it reflects the fresh
    // book right after the edge safety refresh commits. The 3s feed poll never
    // sets eventId, so this is a no-op there (useEventById polls on its own).
    const currentEventId = eventIdRef.current;
    if (currentEventId) {
      void queryClient.invalidateQueries({ queryKey: ['event', currentEventId] });
    }
  };

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
        console.log('[useMarketRefresh] edge response', {
          ids,
          updated: data?.updated,
          requested: data?.requested,
          errors: data?.errors,
          error,
        });
      }

      // Reflect the edge's writes in the feed cache. The 3s price poll does the
      // same read continuously; this just surfaces the 30s safety refresh's
      // result immediately when it actually changed something.
      if (data && data.updated > 0) {
        await patchVisibleFromDb();
      }

      // Consider it a failure only when there's an error; updated=0 just means
      // prices were already fresh — that is a success, not a failure.
      const hasError = error !== null || (data?.errors && data.errors.length > 0);
      const result: RefreshResult = hasError ? 'failed' : 'ok';
      setLastResult(result);

      // Reset result indicator after 4 seconds
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      resultTimerRef.current = setTimeout(() => setLastResult('idle'), 4_000);
    } catch (err) {
      if (import.meta.env.DEV) {
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

  // Fast price poll: the market-tracker keeps market_outcomes ~1s fresh via the
  // CLOB websocket, so the feed only needs to re-read the on-screen markets from
  // the DB every few seconds and patch the cache in place — far cheaper than the
  // edge Gamma fetch, with no upstream load. Skipped on the bet page (eventId
  // set): useEventById owns that refetch cadence on its own 3s interval.
  useEffect(() => {
    if (!autoRefresh || !hasIds || eventId) return;

    const pollTimer = setInterval(() => {
      void patchVisibleFromDb();
    }, MARKETS_PRICE_POLL_INTERVAL_MS);

    return () => clearInterval(pollTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, hasIds, eventId]);

  return { isRefreshing, lastResult, refresh };
}
