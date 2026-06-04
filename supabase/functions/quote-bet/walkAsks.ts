// Pure helpers for walking a Polymarket CLOB order book under a given stake.
//
// The arithmetic mirrors quote_bet_payout() in
// 20260518101639_quote_bet_payout.sql one-for-one so that the DB-side walk
// and this edge-side walk produce identical numbers on identical input. Keep
// them in sync if either side changes.
//
// Also exports serializeSide(), which converts a Polymarket book side
// ({price,size} levels) into the flat numeric[] format the database stores —
// the same shape produced by services/market-tracker/src/db/bookWriter.ts.

export interface BookLevel {
  price: string;
  size: string;
}

export interface WalkResult {
  shares: number;
  filledStake: number;
  avgPrice: number;
  effectiveOdds: number;
  partial: boolean;
  // Total USD depth across all ask levels (Σ price*size).
  availableStake: number;
}

// Persisted book depth. The DISPLAYED quote (BetSlip) walks the FULL freshly
// fetched CLOB book via walkAsks(), but only the top-N serialized levels are
// stored in market_outcome_books — and place_bet/quote_bet_payout walks THOSE
// persisted levels. With a shallow cap (was 10) a large stake that eats past
// the cap fills cheaper in the displayed quote than place_bet can honor, so the
// user sees a payout the executable walk can't match. quote_bet_payout already
// walks the entire persisted array (WHILE v_i < cardinality), so the only
// constraint is write-time depth: persist enough levels that executable ==
// displayed for realistic stakes. Polymarket books rarely exceed ~100 levels;
// ~150 numbers per token is negligible storage and keeps the RPC walk sub-ms.
const TOP_N_LEVELS = 100;

/**
 * Walk asks accumulating fills until the stake is exhausted or the book is
 * empty. partial=true when the available depth couldn't fill the full stake.
 *
 * Asks are sorted ASC by price internally — callers don't have to pre-sort,
 * but providing already-sorted input is fine (sort is stable & cheap).
 */
export function walkAsks(asks: BookLevel[], stake: number): WalkResult {
  if (!Number.isFinite(stake) || stake <= 0) {
    return {
      shares: 0,
      filledStake: 0,
      avgPrice: 0,
      effectiveOdds: 0,
      partial: true,
      availableStake: 0,
    };
  }

  const parsed: Array<{ price: number; size: number }> = [];
  for (const level of asks) {
    const price = parseFloat(level.price);
    const size = parseFloat(level.size);
    if (!Number.isFinite(price) || !Number.isFinite(size)) continue;
    if (price <= 0 || price > 1 || size <= 0) continue;
    parsed.push({ price, size });
  }
  parsed.sort((a, b) => a.price - b.price);

  let remaining = stake;
  let shares = 0;
  let filled = 0;
  let available = 0;

  for (const level of parsed) {
    available += level.price * level.size;
    if (remaining <= 0) continue;
    const levelUsd = level.price * level.size;
    const takeUsd = Math.min(remaining, levelUsd);
    const takeUnits = takeUsd / level.price;
    shares += takeUnits;
    filled += takeUsd;
    remaining -= takeUsd;
  }

  const partial = remaining > 1e-9; // tolerate float error
  return {
    shares,
    filledStake: filled,
    avgPrice: shares > 0 ? filled / shares : 0,
    effectiveOdds: stake > 0 ? shares / stake : 0,
    partial,
    availableStake: available,
  };
}

/**
 * Serialize a book side into the flat [p0,s0,p1,s1,...] numeric[] format the
 * market_outcome_books table uses. Truncated to TOP_N_LEVELS.
 *
 * @param descending - bids should be sorted DESC by price; asks ASC.
 *                     Matches services/market-tracker/src/db/bookWriter.ts.
 */
export function serializeSide(levels: BookLevel[], descending: boolean): number[] {
  const entries: Array<[number, number]> = [];
  for (const level of levels) {
    const price = parseFloat(level.price);
    const size = parseFloat(level.size);
    if (!Number.isFinite(price) || !Number.isFinite(size)) continue;
    if (price <= 0 || price > 1 || size <= 0) continue;
    entries.push([price, size]);
  }
  entries.sort((a, b) => (descending ? b[0] - a[0] : a[0] - b[0]));
  const top = entries.slice(0, TOP_N_LEVELS);

  const flat: number[] = [];
  for (const [price, size] of top) {
    flat.push(price, size);
  }
  return flat;
}
