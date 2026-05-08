import type { MarketStatus } from './types';

interface StatusAndCloseAt {
  status: MarketStatus;
  close_at: string | null;
}

/**
 * Returns true iff the market's own status is open AND close_at has not passed
 * AND — when a parent event is provided — the event is also effectively open.
 * Used by the feed page to exclude markets whose parent event has already closed
 * from the 'open' tab count and visible list.
 */
export function isMarketEffectivelyOpen(
  market: StatusAndCloseAt,
  event?: StatusAndCloseAt | null
): boolean {
  if (market.status !== 'open') return false;
  if (market.close_at != null && new Date(market.close_at).getTime() <= Date.now()) return false;
  if (event) {
    if (event.status !== 'open') return false;
    if (event.close_at != null && new Date(event.close_at).getTime() <= Date.now()) return false;
  }
  return true;
}

/**
 * Returns 'closed' when a market's status is 'open' but close_at has passed,
 * otherwise returns the row's own status. Used by cards for status pill rendering.
 */
export function getMarketEffectiveStatus(market: StatusAndCloseAt): MarketStatus {
  if (
    market.status === 'open' &&
    market.close_at != null &&
    new Date(market.close_at).getTime() <= Date.now()
  ) {
    return 'closed';
  }
  return market.status;
}
