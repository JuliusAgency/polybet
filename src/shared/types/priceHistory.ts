// Price-history domain primitives.
//
// These live in shared/ (not features/bet) because shared/ui/PriceHistoryChart
// consumes them and shared must never import from a higher FSD layer. The
// features/bet hooks (usePriceHistory, priceHistoryBucket) re-export these for
// backward compatibility, so `@/features/bet` imports keep working.

export interface PriceHistoryPoint {
  outcome_id: string;
  bucket_ts: string;
  price: number;
}

export type PriceHistoryWindow = '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL';

export const PRICE_HISTORY_WINDOWS: readonly PriceHistoryWindow[] = [
  '1H',
  '6H',
  '1D',
  '1W',
  '1M',
  'ALL',
] as const;
