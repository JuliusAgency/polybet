import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { getPriceHistoryRange, type PriceHistoryWindow } from './priceHistoryBucket';

export interface PriceHistoryPoint {
  outcome_id: string;
  bucket_ts: string;
  price: number;
}

interface RpcRow {
  outcome_id: string;
  bucket_ts: string;
  price: number | string;
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
  });
}
