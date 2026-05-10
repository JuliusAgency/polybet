import { invokeSupabaseFunction } from '@/shared/api/supabase';
import type { PriceHistoryWindow } from './priceHistoryBucket';
import type { PriceHistoryPoint } from './usePriceHistory';

interface PriceHistoryFunctionResponse {
  points?: Array<{ outcome_id: string; bucket_ts: string; price: number | string }>;
}

/** Fetches price history for a single market from the edge function.
 * Both usePriceHistory and useEventPriceHistory share this to keep the
 * cache key shape consistent (same queryFn means same stale data is reused). */
export async function fetchPriceHistory(
  marketId: string,
  historyWindow: PriceHistoryWindow
): Promise<PriceHistoryPoint[]> {
  const { data, error } = await invokeSupabaseFunction<PriceHistoryFunctionResponse>(
    'market-price-history',
    { body: { market_id: marketId, window: historyWindow } }
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
}
