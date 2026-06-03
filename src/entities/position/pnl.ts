import type { Position } from './types';

// Mark-to-market helpers. `currentBid` is the per-share price the user could
// sell at right now (the slippage-adjusted average from quote_sell_proceeds, or
// the top bid for a quick estimate). All pure — safe to memoize in components.

type CostShape = Pick<Position, 'shares' | 'cost_basis'>;

/** Current liquidation value of the held shares at the given per-share bid. */
export function positionCurrentValue(shares: number, currentBid: number): number {
  return shares * currentBid;
}

/** Unrealized P/L = current value − cost basis (what you'd net by selling now). */
export function positionUnrealizedPnl(position: CostShape, currentBid: number): number {
  return position.shares * currentBid - position.cost_basis;
}

/**
 * Unrealized P/L as a fraction of cost basis (0.29 → +29%). Returns null when
 * there is no cost basis to measure against (closed/empty position).
 */
export function positionUnrealizedPnlPct(position: CostShape, currentBid: number): number | null {
  if (position.cost_basis <= 0) return null;
  return (position.shares * currentBid - position.cost_basis) / position.cost_basis;
}
