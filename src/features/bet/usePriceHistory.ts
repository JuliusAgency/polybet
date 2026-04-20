import { useQuery } from '@tanstack/react-query';
import { invokeSupabaseFunction } from '@/shared/api/supabase';
import type { PriceHistoryWindow } from './priceHistoryBucket';

export interface PriceHistoryPoint {
  outcome_id: string;
  bucket_ts: string;
  price: number;
}

interface FunctionResponse {
  points?: Array<{ outcome_id: string; bucket_ts: string; price: number | string }>;
}

export function usePriceHistory(
  marketId: string | undefined,
  window: PriceHistoryWindow,
  enabled: boolean = true
) {
  return useQuery<PriceHistoryPoint[], Error>({
    queryKey: ['priceHistory', marketId, window] as const,
    enabled: enabled && !!marketId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!marketId) return [];
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
  });
}
