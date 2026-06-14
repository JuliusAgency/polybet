import type { Market, MarketOutcome } from './types';

const YES_NAMES = new Set(['yes', 'true', 'long']);
const NO_NAMES = new Set(['no', 'false', 'short']);

type OutcomesHolder = Pick<Market, 'market_outcomes'>;

const normalize = (s: string) => s.trim().toLowerCase();

export function isBinaryMarket(market: OutcomesHolder): boolean {
  return market.market_outcomes.length === 2;
}

/**
 * Returns the "Yes"-side outcome of a binary market by name match
 * (case-insensitive). Falls back to null when the market is not binary
 * or its outcome names don't match the known positive aliases.
 */
export function getYesOutcome(market: OutcomesHolder): MarketOutcome | null {
  if (!isBinaryMarket(market)) return null;
  return market.market_outcomes.find((o) => YES_NAMES.has(normalize(o.name))) ?? null;
}

export function getNoOutcome(market: OutcomesHolder): MarketOutcome | null {
  if (!isBinaryMarket(market)) return null;
  return market.market_outcomes.find((o) => NO_NAMES.has(normalize(o.name))) ?? null;
}

/**
 * Canonical [Yes, No] outcome order for binary markets. Falls back to the
 * source array when the market is non-binary or its names don't match the
 * known aliases — defensive so future Polymarket variants render at all.
 */
export function getOrderedOutcomes(market: OutcomesHolder): MarketOutcome[] {
  if (!isBinaryMarket(market)) return market.market_outcomes;
  const yes = getYesOutcome(market);
  const no = getNoOutcome(market);
  if (!yes || !no) return market.market_outcomes;
  return [yes, no];
}

/** Yes-side probability (0..1) for a binary market, or null. */
export function getYesProbability(market: OutcomesHolder): number | null {
  return getYesOutcome(market)?.price ?? null;
}

/**
 * Sort markets by Yes-side probability DESC, stable. Markets without a Yes
 * price (non-binary or missing) sink to the bottom while keeping their
 * relative order — matches Polymarket's multi-outcome event layout.
 */
export function sortMarketsByYesDesc<T extends OutcomesHolder>(markets: readonly T[]): T[] {
  return markets
    .map((m, i) => ({ m, i, yes: getYesProbability(m) }))
    .sort((a, b) => {
      if (a.yes == null && b.yes == null) return a.i - b.i;
      if (a.yes == null) return 1;
      if (b.yes == null) return -1;
      if (a.yes !== b.yes) return b.yes - a.yes;
      return a.i - b.i;
    })
    .map(({ m }) => m);
}
