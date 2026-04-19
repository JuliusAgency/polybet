import { useQueries } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { getPriceHistoryRange, type PriceHistoryWindow } from './priceHistoryBucket';
import type { PriceHistoryPoint } from './usePriceHistory';

interface RpcRow {
  outcome_id: string;
  bucket_ts: string;
  price: number | string;
}

export interface EventPriceHistoryResult {
  pointsByMarketId: Record<string, PriceHistoryPoint[]>;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Load price history for many markets in parallel (one query per market).
 * Uses the same RPC + bucketing as `usePriceHistory`, so cache keys are compatible.
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
        const { since, until, bucket } = getPriceHistoryRange(window);
        const { data, error } = await supabase.rpc('get_market_price_history', {
          p_market_id: marketId,
          p_since: since.toISOString(),
          p_until: until.toISOString(),
          p_bucket: bucket,
        });
        if (error) throw new Error(error.message);
        return (data ?? []).map((row: RpcRow) => ({
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
