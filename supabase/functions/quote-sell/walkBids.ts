// Pure helpers for walking a Polymarket CLOB order book to price a SELL.
//
// The arithmetic mirrors quote_sell_proceeds() in
// 20260602130622_quote_sell_and_sell_position.sql one-for-one so the DB-side
// walk and this edge-side walk produce identical numbers on identical input.
// Keep them in sync if either side changes.
//
// serializeSide() is duplicated from quote-bet/walkAsks.ts because Supabase
// edge functions are bundled independently and cannot import across function
// directories. Both copies must stay identical to bookWriter.ts.

export interface BookLevel {
  price: string;
  size: string;
}

export interface SellWalkResult {
  // USD received for selling `shares` (Σ takenShares * price), bid side.
  proceeds: number;
  // Shares actually sold (== requested unless partial).
  filledShares: number;
  // Volume-weighted average sell price in (0,1).
  avgPrice: number;
  // true when bid depth could not absorb the full size.
  partial: boolean;
  // Total bid depth in shares (Σ size). The max sellable size right now.
  availableShares: number;
}

// Persisted bid-book depth. Mirrors the ask-side fix in quote-bet/walkAsks.ts:
// with a shallow cap a large sell that eats past the cap gets partial=true from
// quote_sell_proceeds even though the live book can fill it — a false
// "Insufficient liquidity" rejection. 100 matches the ask side; Polymarket books
// rarely exceed ~100 levels and ~200 numbers/token is negligible storage.
const TOP_N_LEVELS = 100;

/**
 * Walk bids (DESC by price) accumulating proceeds until `shares` is sold or the
 * book is exhausted. partial=true when depth couldn't absorb the full size;
 * filledShares is then the max sellable.
 */
export function walkBids(bids: BookLevel[], shares: number): SellWalkResult {
  if (!Number.isFinite(shares) || shares <= 0) {
    return { proceeds: 0, filledShares: 0, avgPrice: 0, partial: true, availableShares: 0 };
  }

  const parsed: Array<{ price: number; size: number }> = [];
  for (const level of bids) {
    const price = parseFloat(level.price);
    const size = parseFloat(level.size);
    if (!Number.isFinite(price) || !Number.isFinite(size)) continue;
    if (price <= 0 || price > 1 || size <= 0) continue;
    parsed.push({ price, size });
  }
  parsed.sort((a, b) => b.price - a.price); // best (highest) bid first

  let remaining = shares;
  let proceeds = 0;
  let filled = 0;
  let available = 0;

  for (const level of parsed) {
    available += level.size;
    if (remaining <= 0) continue;
    const takeUnits = Math.min(remaining, level.size);
    proceeds += takeUnits * level.price;
    filled += takeUnits;
    remaining -= takeUnits;
  }

  const partial = remaining > 1e-9; // tolerate float error
  return {
    proceeds,
    filledShares: filled,
    avgPrice: filled > 0 ? proceeds / filled : 0,
    partial,
    availableShares: available,
  };
}

/**
 * Serialize a book side into the flat [p0,s0,p1,s1,...] numeric[] format the
 * market_outcome_books table uses. Truncated to TOP_N_LEVELS.
 *
 * @param descending - bids DESC by price; asks ASC. Matches bookWriter.ts.
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
