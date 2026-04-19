export type PriceHistoryWindow = '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL';

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

export const PRICE_HISTORY_WINDOWS: readonly PriceHistoryWindow[] = [
  '1H',
  '6H',
  '1D',
  '1W',
  '1M',
  'ALL',
] as const;
