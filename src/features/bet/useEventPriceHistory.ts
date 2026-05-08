import { useQueries } from '@tanstack/react-query';
import type { PriceHistoryWindow } from './priceHistoryBucket';
import type { PriceHistoryPoint } from './usePriceHistory';
import { fetchPriceHistory } from './fetchPriceHistory';

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
      queryFn: (): Promise<PriceHistoryPoint[]> => fetchPriceHistory(marketId, window),
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
