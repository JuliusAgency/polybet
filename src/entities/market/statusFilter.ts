import { STATUS_MAP, type MarketStatusFilter } from './statusMap';

/**
 * Apply the standard status filter ladder to a Supabase query builder.
 * The 'open' and 'closed' cases mirror the effectiveStatus rule: a market
 * with status='open' but close_at in the past renders as 'closed'.
 *
 * Generic in `Q` so callers preserve their concrete builder type for
 * subsequent chaining. PostgREST's chained types are deeply generic and
 * tightly coupled to query-builder internals; expressing the chain
 * structurally would couple entities/ to those internals. The internal
 * `any` cast is a deliberate, documented seam.
 */
export function applyMarketStatusFilter<Q>(
  query: Q,
  statusFilter: MarketStatusFilter,
  now: Date
): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = query as any;
  if (statusFilter === 'open') {
    const nowIso = now.toISOString();
    return q.eq('status', 'open').or(`close_at.is.null,close_at.gt.${nowIso}`) as Q;
  }
  if (statusFilter === 'closed') {
    const nowIso = now.toISOString();
    return q.or(`status.eq.closed,and(status.eq.open,close_at.lte.${nowIso})`) as Q;
  }
  if (statusFilter !== 'all') {
    return q.in('status', STATUS_MAP[statusFilter]) as Q;
  }
  return query;
}
