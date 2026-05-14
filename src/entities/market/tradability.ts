import type { Market, MarketOutcome } from './types';

// Polymarket parity: a sub-cent side (e.g. 0.5¢) stays clickable — the order
// book on Polymarket itself keeps both sides active down to 0.1¢. We only
// guard against the true-zero floor where there is literally nothing to buy.
// Antifraud guarantees (drift tolerance, 3-min outcome staleness, 30s frontend
// polling) live in the place_bet RPC, not in this UI gate.
export const MIN_TRADABLE_PRICE = 0.001;

export function isOutcomeTradable(price: number | null | undefined): boolean {
  if (price == null || !Number.isFinite(price)) return true;
  // Block only the priced-into-the-floor side. Allow everything up to (but
  // not including) 1.0 — at exactly 1.0 there is nothing to gain.
  return price >= MIN_TRADABLE_PRICE && price < 1;
}

// A binary market is "fully illiquid" only when BOTH sides are at the floor
// (effectively impossible — happens only on broken syncs). For long-tail
// markets the dominant side stays tradable; we never disable the whole market.
export function isMarketTradable(market: Pick<Market, 'market_outcomes'>): boolean {
  const outs = market.market_outcomes ?? [];
  if (outs.length === 0) return true;
  return outs.some((o: MarketOutcome) => isOutcomeTradable(o.price));
}
