// Edge Function: market-price-history
//
// Proxies Polymarket CLOB `/prices-history` so the browser can render the
// EventDetail chart without CORS problems and without us having to maintain
// a timeseries table. Supabase stores no history for the chart — the source
// of truth is Polymarket.
//
// Request  (POST):
//   { market_id: string, window: '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL' }
//
// Response (200):
//   { points: Array<{ outcome_id: string, bucket_ts: string, price: number }> }
//
// Guardrails:
//   • Per-instance in-memory cache (30s TTL) keyed by tokenId+window — 1000
//     viewers of the same hot market turn into one upstream request.
//   • In-flight deduplication — concurrent cache misses for the same key
//     share a single upstream promise.
//   • All outcomes for the market are fetched in parallel.
//
// Auth:
//   • verify_jwt = false at the gateway (see supabase/config.toml). This
//     function validates the caller's bearer token in-process via
//     authorizeEdgeCall() and only accepts authenticated users.

import { authorizeEdgeCall } from '../_shared/edgeAuth.ts';
import { buildCorsPreflightResponse, jsonWithCors } from '../_shared/cors.ts';

const POLYMARKET_CLOB_BASE = 'https://clob.polymarket.com';
const CACHE_TTL_MS = 30_000;
const UPSTREAM_TIMEOUT_MS = 8_000;

type PriceWindow = '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL';

interface WindowSpec {
  /** Value for the Polymarket `interval` query param. */
  interval: '1h' | '6h' | '1d' | '1w' | '1m' | 'max';
  /** Point granularity (minutes). Polymarket expects minutes on this param. */
  fidelityMin: number;
}

// Polymarket's /prices-history supports a preset `interval` query (1h/6h/1d/1w/1m/max).
// Using it is the safe path — the alternative (startTs/endTs) enforces a
// "not too wide" check that rejected our 365-day ALL request.
// `fidelity` is provided in MINUTES. Values chosen to keep responses under ~1k points.
const WINDOW_SPEC: Record<PriceWindow, WindowSpec> = {
  '1H': { interval: '1h', fidelityMin: 1 },
  '6H': { interval: '6h', fidelityMin: 1 },
  '1D': { interval: '1d', fidelityMin: 10 },
  '1W': { interval: '1w', fidelityMin: 60 },
  '1M': { interval: '1m', fidelityMin: 240 },
  ALL: { interval: 'max', fidelityMin: 1440 },
};

interface PricePoint {
  outcome_id: string;
  bucket_ts: string;
  price: number;
}

interface CacheEntry {
  expiresAt: number;
  points: Array<{ bucket_ts: string; price: number }>;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Array<{ bucket_ts: string; price: number }>>>();

interface RequestBody {
  market_id?: unknown;
  window?: unknown;
}

function parseBody(body: RequestBody): { market_id: string; window: PriceWindow } | null {
  if (typeof body.market_id !== 'string' || body.market_id.length === 0) return null;
  if (typeof body.window !== 'string') return null;
  if (!(body.window in WINDOW_SPEC)) return null;
  return { market_id: body.market_id, window: body.window as PriceWindow };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return buildCorsPreflightResponse('POST, OPTIONS');
  }
  if (req.method !== 'POST') {
    return jsonWithCors({ error: 'Method not allowed. Use POST.' }, 405);
  }

  let parsed: { market_id: string; window: PriceWindow } | null;
  try {
    const raw = (await req.json()) as RequestBody;
    parsed = parseBody(raw);
  } catch {
    return jsonWithCors({ error: 'Invalid JSON body' }, 400);
  }

  if (!parsed) {
    return jsonWithCors(
      { error: 'market_id (uuid) and window (1H|6H|1D|1W|1M|ALL) are required' },
      400
    );
  }

  const authResult = await authorizeEdgeCall(req, {});
  if (!authResult.ok) {
    console.warn(
      `[market-price-history] auth failed status=${authResult.status} body=${JSON.stringify(authResult.body)} hasAuthHeader=${req.headers.has('Authorization')}`
    );
    return jsonWithCors(authResult.body, authResult.status);
  }

  const supabase = authResult.adminClient;
  const { market_id, window } = parsed;

  const { data: rawOutcomes, error: outcomesErr } = await supabase
    .from('market_outcomes')
    .select('id, polymarket_token_id')
    .eq('market_id', market_id);

  if (outcomesErr) {
    return jsonWithCors({ error: 'Failed to load outcomes', details: outcomesErr.message }, 500);
  }

  interface OutcomeRow {
    id: string;
    polymarket_token_id: string;
  }
  const outcomes = (rawOutcomes ?? []) as Array<{ id: unknown; polymarket_token_id: unknown }>;
  const validOutcomes: OutcomeRow[] = [];
  for (const o of outcomes) {
    if (
      typeof o.id === 'string' &&
      typeof o.polymarket_token_id === 'string' &&
      o.polymarket_token_id.length > 0
    ) {
      validOutcomes.push({ id: o.id, polymarket_token_id: o.polymarket_token_id });
    }
  }

  if (validOutcomes.length === 0) {
    return jsonWithCors({ points: [] as PricePoint[] });
  }

  const spec = WINDOW_SPEC[window];

  console.log(
    `[market-price-history] market=${market_id} window=${window} outcomes=${validOutcomes.length} interval=${spec.interval} fidelity=${spec.fidelityMin}m`
  );

  const fetchedPerOutcome = await Promise.all(
    validOutcomes.map(async (o: OutcomeRow) => {
      const series = await fetchPolymarketHistory(
        o.polymarket_token_id,
        spec.interval,
        spec.fidelityMin
      );
      console.log(
        `[market-price-history] outcome=${o.id} token=${o.polymarket_token_id.slice(0, 20)}... points=${series.length}`
      );
      return series.map(
        (p): PricePoint => ({
          outcome_id: o.id,
          bucket_ts: p.bucket_ts,
          price: p.price,
        })
      );
    })
  );

  const points: PricePoint[] = fetchedPerOutcome.flat();
  points.sort((a, b) => (a.bucket_ts < b.bucket_ts ? -1 : a.bucket_ts > b.bucket_ts ? 1 : 0));

  console.log(`[market-price-history] total points returned: ${points.length}`);

  return jsonWithCors({ points });
});

async function fetchPolymarketHistory(
  tokenId: string,
  interval: string,
  fidelityMin: number
): Promise<Array<{ bucket_ts: string; price: number }>> {
  const cacheKey = `${tokenId}:${interval}:${fidelityMin}`;

  // Fast path: fresh cache entry
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.points;
  }

  // Coalesce concurrent misses: first caller owns the fetch, others await it
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const points = await fetchFromUpstream(tokenId, interval, fidelityMin);
      cache.set(cacheKey, { points, expiresAt: Date.now() + CACHE_TTL_MS });
      return points;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

async function fetchFromUpstream(
  tokenId: string,
  interval: string,
  fidelityMin: number
): Promise<Array<{ bucket_ts: string; price: number }>> {
  const url = new URL('/prices-history', POLYMARKET_CLOB_BASE);
  url.searchParams.set('market', tokenId);
  url.searchParams.set('interval', interval);
  url.searchParams.set('fidelity', String(fidelityMin));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      console.warn(
        `[market-price-history] upstream ${res.status} for token=${tokenId.slice(0, 20)}... url=${url.toString()} body=${body.slice(0, 200)}`
      );
      // Return empty rather than throwing — a single outcome being unavailable
      // should not blow up the whole event chart.
      return [];
    }

    const body = (await res.json()) as { history?: Array<Record<string, unknown>> };
    const history = Array.isArray(body.history) ? body.history : [];
    if (history.length === 0) {
      console.warn(
        `[market-price-history] upstream returned empty history for token=${tokenId.slice(0, 20)}... keys=${Object.keys(body).join(',')}`
      );
    }

    const points: Array<{ bucket_ts: string; price: number }> = [];
    for (const row of history) {
      // Polymarket has historically used `t`/`p` on this endpoint, but the
      // public SDK docs describe `ts`/`price`. Accept either.
      const tsRaw = row['t'] ?? row['ts'];
      const priceRaw = row['p'] ?? row['price'];

      const tsNum = typeof tsRaw === 'number' ? tsRaw : Number(tsRaw);
      const priceNum = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw);

      if (!Number.isFinite(tsNum) || !Number.isFinite(priceNum)) continue;

      points.push({
        bucket_ts: new Date(tsNum * 1000).toISOString(),
        price: priceNum,
      });
    }

    return points;
  } catch (err) {
    console.error(
      `[market-price-history] fetch threw for token=${tokenId.slice(0, 20)}...`,
      err instanceof Error ? err.message : err
    );
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
