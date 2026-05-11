import type { Market, MarketOutcome } from './types';

// A side becomes effectively untradable on Polymarket once its price collapses
// near 0¢ — the order book thins out, asks disappear, and a click would
// trade at displayed odds of 100x-2000x with practically no chance of winning.
// That's the dangerous direction: stake 100 → potential payout 200_000.
//
// The OPPOSITE high-price side (e.g. 99.8¢) stays legitimate to buy. Yes,
// the EV is awful (odds ≈ 1.002), but it's a real bet, the order book is
// deep, and Polymarket itself keeps the buy button active. So we only block
// the low side; the dominant side is always tradable as long as price < 1.
export const MIN_TRADABLE_PRICE = 0.01;

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
