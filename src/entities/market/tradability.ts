import type { Market } from './types';

// Polymarket parity: every non-resolved, non-closed outcome stays clickable
// across the full (0, 1) price band. Fillability is decided by the live order
// book quote (useBetQuote / quote_bet_payout RPC) and the place_bet RPC's
// partial-fill guard — not by an arbitrary price floor in the UI. Antifraud
// guarantees (3-min outcome staleness, 2% drift tolerance, 5s book staleness)
// live in the place_bet RPC, not in this UI gate.
export function isOutcomeTradable(price: number | null | undefined): boolean {
  return price == null || Number.isFinite(price);
}

// A market with at least one outcome is tradable from the UI's point of view.
// Per-outcome non-interactivity is driven by polymarket_token_id at the call
// site; the whole-market gate stays here only as a defensive empty-outcome
// short-circuit.
export function isMarketTradable(market: Pick<Market, 'market_outcomes'>): boolean {
  const outs = market.market_outcomes ?? [];
  return outs.length > 0;
}
