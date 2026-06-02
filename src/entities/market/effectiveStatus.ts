import type { MarketStatus } from './types';

interface StatusAndCloseAt {
  status: MarketStatus;
  close_at: string | null;
}

/**
 * Returns true iff the market's own status is open AND — when a parent event is
 * provided — the event is also open.
 *
 * Authority is `status` (synced from Polymarket's closed/resolved flags), NOT
 * `close_at`. Polymarket keeps some markets tradable (closed=false) past their
 * stated endDate, and occasionally ships an endDate that contradicts the market
 * title (e.g. a "June 30" market with endDate=May 31). Gating on a past
 * close_at therefore mis-closed markets Polymarket still trades. close_at is now
 * purely informational (display only).
 */
export function isMarketEffectivelyOpen(
  market: StatusAndCloseAt,
  event?: StatusAndCloseAt | null
): boolean {
  if (market.status !== 'open') return false;
  if (event && event.status !== 'open') return false;
  return true;
}

/**
 * Returns the market's own status. Kept as the single rendering entrypoint so
 * status-pill logic stays centralized; close_at no longer overrides status.
 */
export function getMarketEffectiveStatus(market: StatusAndCloseAt): MarketStatus {
  return market.status;
}
