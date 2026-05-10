// Shared Gamma API URL builders + condition_ids fetch helpers.
//
// Why this file exists: the Gamma `/markets?condition_ids=…` endpoint implicitly
// hides markets where `closed=true` when no `closed` flag is supplied. This
// silently dropped any market sitting in the limbo state `closed=true,
// resolved=null` (UMA proposed but not finalized) — the sync kept seeing an
// empty response and left DB rows stuck on `status='open'`, with bets unsettled.
//
// Verified against the live API (probe date 2026-05-10):
//   ?condition_ids=<limbo>&limit=10              → []         (hidden by default)
//   ?condition_ids=<limbo>&closed=any&limit=10   → 400        ("closed has a wrong value")
//   ?condition_ids=<limbo>&closed=true&limit=10  → [<limbo>]  (returned)
//   ?condition_ids=<open>&closed=false&limit=10  → [<open>]   (returned)
//   ?condition_ids=<open>&closed=true&limit=10   → []         (filtered out)
// `closed=true` and `closed=false` are mutually exclusive — `closed=any` is not
// supported. So we issue both calls and merge the results client-side.
//
// For the full-mode sync we also add LIMBO_MARKETS_URL — the dedicated page
// that surfaces `closed=true, resolved=false` markets (the bucket the existing
// ACTIVE_MARKETS_URL and RESOLVED_MARKETS_URL pools both miss).

import { fetchJsonWithRetry } from './gammaFetch.ts';

export const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

interface GammaMarketLite {
  conditionId: string;
}

export function buildConditionIdsUrl(
  conditionIds: string[],
  options: { closed: boolean; limit?: number }
): string {
  const limit = options.limit ?? Math.max(conditionIds.length, 1);
  const params = conditionIds.map((id) => `condition_ids=${encodeURIComponent(id)}`).join('&');
  return `${GAMMA_API_BASE}/markets?limit=${limit}&closed=${options.closed}&${params}`;
}

interface FetchGammaMarketsByConditionIdsOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  /** Limit per call (each closed-side request gets this); defaults to ids.length. */
  limit?: number;
}

/** Fetch the merged set of Gamma markets by conditionId, including markets in
 *  the `closed=true` state. Issues two concurrent requests (closed=false and
 *  closed=true) and returns a map keyed by conditionId. Newer-priority records
 *  (closed=true, since those are the previously-invisible ones) win on collision,
 *  but a market should only ever match one side. */
export async function fetchGammaMarketsByConditionIds<T extends GammaMarketLite>(
  conditionIds: string[],
  options: FetchGammaMarketsByConditionIdsOptions = {}
): Promise<Map<string, T>> {
  if (conditionIds.length === 0) return new Map();
  const { timeoutMs, maxAttempts, limit } = options;
  const fetchOpts = {
    headers: { Accept: 'application/json' },
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(maxAttempts !== undefined ? { maxAttempts } : {}),
  };

  const [openItems, closedItems] = await Promise.all([
    fetchJsonWithRetry<T[]>(
      buildConditionIdsUrl(conditionIds, { closed: false, limit }),
      fetchOpts
    ),
    fetchJsonWithRetry<T[]>(buildConditionIdsUrl(conditionIds, { closed: true, limit }), fetchOpts),
  ]);

  const result = new Map<string, T>();
  for (const m of [
    ...(Array.isArray(openItems) ? openItems : []),
    ...(Array.isArray(closedItems) ? closedItems : []),
  ]) {
    if (m?.conditionId) result.set(m.conditionId, m);
  }
  return result;
}
