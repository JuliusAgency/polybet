import { useQuery } from '@tanstack/react-query';
import type { PriceHistoryWindow } from './priceHistoryBucket';
import { fetchPriceHistory } from './fetchPriceHistory';

// Re-exported from shared so existing `@/features/bet` consumers are unaffected
// after the type moved down to shared/ (FSD: shared/ui needs it too).
export type { PriceHistoryPoint } from '@/shared/types/priceHistory';
import type { PriceHistoryPoint } from '@/shared/types/priceHistory';

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
