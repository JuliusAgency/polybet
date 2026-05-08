import { useQuery } from '@tanstack/react-query';
import type { PriceHistoryWindow } from './priceHistoryBucket';
import { fetchPriceHistory } from './fetchPriceHistory';

export interface PriceHistoryPoint {
  outcome_id: string;
  bucket_ts: string;
  price: number;
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
    queryFn: () => {
      if (!marketId) return Promise.resolve([]);
      return fetchPriceHistory(marketId, window);
    },
  });
}
