// PriceHistoryWindow + PRICE_HISTORY_WINDOWS moved to shared/ (consumed by
// shared/ui/PriceHistoryChart). Re-exported here so `@/features/bet` consumers
// are unaffected. The path is relative (not the `@/` alias) because this module
// is loaded by the node:test tier, which resolves relative imports only.
export type { PriceHistoryWindow } from '../../shared/types/priceHistory';
export { PRICE_HISTORY_WINDOWS } from '../../shared/types/priceHistory';
import type { PriceHistoryWindow } from '../../shared/types/priceHistory';

export interface PriceHistoryRange {
  since: Date;
  until: Date;
  bucket: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function getPriceHistoryRange(
  window: PriceHistoryWindow,
  now: Date = new Date()
): PriceHistoryRange {
  const until = now;
  switch (window) {
    case '1H':
      return { since: new Date(now.getTime() - HOUR_MS), until, bucket: '1 minute' };
    case '6H':
      return { since: new Date(now.getTime() - 6 * HOUR_MS), until, bucket: '5 minutes' };
    case '1D':
      return { since: new Date(now.getTime() - DAY_MS), until, bucket: '15 minutes' };
    case '1W':
      return { since: new Date(now.getTime() - 7 * DAY_MS), until, bucket: '1 hour' };
    case '1M':
      return { since: new Date(now.getTime() - 30 * DAY_MS), until, bucket: '4 hours' };
    case 'ALL':
      return { since: new Date(0), until, bucket: '1 day' };
  }
}
