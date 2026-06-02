import { STATUS_MAP, type MarketStatusFilter } from './statusMap';

/**
 * Apply the standard status filter ladder to a Supabase query builder.
 * Authority is the row's `status` (synced from Polymarket's closed/resolved
 * flags). close_at is NOT used to derive open/closed — Polymarket trades some
 * markets past their stated endDate, so gating on a past close_at mis-closed
 * them. See entities/market/effectiveStatus.ts for the rationale.
 *
 * Generic in `Q` so callers preserve their concrete builder type for
 * subsequent chaining. PostgREST's chained types are deeply generic and
 * tightly coupled to query-builder internals; expressing the chain
 * structurally would couple entities/ to those internals. The internal
 * `any` cast is a deliberate, documented seam.
 */
export function applyMarketStatusFilter<Q>(query: Q, statusFilter: MarketStatusFilter): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = query as any;
  if (statusFilter === 'all') {
    return query;
  }
  return q.in('status', STATUS_MAP[statusFilter]) as Q;
}
