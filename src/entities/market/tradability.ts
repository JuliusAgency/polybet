import type { Market, MarketOutcome } from './types';

// A side becomes effectively untradable on Polymarket once the order book
// thins out near 0¢ / 100¢ — the asks disappear and a click would either
// fail or trade at a price the user can't actually win on. We mirror that
// here so PolyBet doesn't accept a 100-stake bet at displayed odds of 2000
// when the team has practically already lost.
export const MIN_TRADABLE_PRICE = 0.01;
export const MAX_TRADABLE_PRICE = 1 - MIN_TRADABLE_PRICE;

export function isOutcomeTradable(price: number | null | undefined): boolean {
  if (price == null || !Number.isFinite(price)) return true;
  return price >= MIN_TRADABLE_PRICE && price <= MAX_TRADABLE_PRICE;
}

// Binary markets are illiquid as a whole when one side has been priced into
// the floor — there is no meaningful bet on either side. Multi-outcome
// markets keep tradable on the dominant side even when long-tail outcomes
// hit the floor, so we don't flag the whole market.
export function isMarketTradable(market: Pick<Market, 'market_outcomes'>): boolean {
  const outs = market.market_outcomes ?? [];
  if (outs.length !== 2) return true;
  return outs.every((o: MarketOutcome) => isOutcomeTradable(o.price));
}
