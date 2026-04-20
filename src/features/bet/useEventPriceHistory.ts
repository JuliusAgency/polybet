import { useQueries } from '@tanstack/react-query';
import { invokeSupabaseFunction } from '@/shared/api/supabase';
import type { PriceHistoryWindow } from './priceHistoryBucket';
import type { PriceHistoryPoint } from './usePriceHistory';

interface FunctionResponse {
  points?: Array<{ outcome_id: string; bucket_ts: string; price: number | string }>;
}

export interface EventPriceHistoryResult {
  pointsByMarketId: Record<string, PriceHistoryPoint[]>;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Load price history for many markets in parallel (one query per market).
 * Uses the same edge function + cache keys as `usePriceHistory`, so cached
 * data is shared across the single-market and multi-market charts.
 */
export function useEventPriceHistory(
  marketIds: string[],
  window: PriceHistoryWindow,
  enabled: boolean = true
): EventPriceHistoryResult {
  const results = useQueries({
    queries: marketIds.map((marketId) => ({
      queryKey: ['priceHistory', marketId, window] as const,
      enabled: enabled && !!marketId,
      staleTime: 30_000,
      queryFn: async (): Promise<PriceHistoryPoint[]> => {
        const { data, error } = await invokeSupabaseFunction<FunctionResponse>(
          'market-price-history',
          { body: { market_id: marketId, window } }
        );
        if (error) {
          const message = error instanceof Error ? error.message : 'Failed to load price history';
          throw new Error(message);
        }
        const rows = data?.points ?? [];
        return rows.map((row) => ({
          outcome_id: row.outcome_id,
          bucket_ts: row.bucket_ts,
          price: typeof row.price === 'string' ? Number(row.price) : row.price,
        }));
      },
    })),
  });

  const pointsByMarketId: Record<string, PriceHistoryPoint[]> = {};
  let isLoading = false;
  let isError = false;

  results.forEach((result, idx) => {
    const marketId = marketIds[idx];
    if (result.isLoading) isLoading = true;
    if (result.isError) isError = true;
    pointsByMarketId[marketId] = result.data ?? [];
  });

  return { pointsByMarketId, isLoading, isError };
}
