// Edge Function: quote-sell
//
// The SELL-side mirror of quote-bet. Called by the BetSlip Sell tab / Portfolio
// Sell action on every (debounced) share-quantity change and once more at
// Confirm. Walks the live Polymarket CLOB bid side for the requested share
// count and UPSERTs the top-N levels (BOTH sides) into market_outcome_books so
// the subsequent sell_position RPC reads a freshly-populated row (<=5s) and
// settles at the same bid-derived price the user saw.
//
// Auth: in-function via authorizeEdgeCall (verify_jwt = false in config.toml,
// per project policy in CLAUDE.md).
// CLOB endpoint: https://clob.polymarket.com/book?token_id=<id> — public,
// CORS-friendly. Soft-fails on 5xx/timeout — the client treats book_updated_at
// = null as "quote unavailable" and disables the Sell CTA.

import { authorizeEdgeCall } from '../_shared/edgeAuth.ts';
import { buildCorsPreflightResponse, jsonWithCors } from '../_shared/cors.ts';
import { walkBids, serializeSide, type BookLevel } from './walkBids.ts';

const CLOB_BASE = Deno.env.get('POLYMARKET_CLOB_BASE') ?? 'https://clob.polymarket.com';
const CLOB_TIMEOUT_MS = 4_000;
const CLOB_RETRY_DELAY_MS = 200;
const MAX_SHARES = 100_000_000;

interface ClobBookResponse {
  market?: string;
  asset_id?: string;
  hash?: string;
  timestamp?: string;
  bids?: BookLevel[];
  asks?: BookLevel[];
}

interface QuoteSellRequest {
  polymarket_token_id?: unknown;
  shares?: unknown;
}

interface QuoteSellResponse {
  proceeds: number;
  filled_shares: number;
  avg_price: number;
  partial: boolean;
  book_updated_at: string | null;
  available_shares: number | null;
}

async function fetchClobBook(tokenId: string): Promise<ClobBookResponse | null> {
  const url = `${CLOB_BASE}/book?token_id=${encodeURIComponent(tokenId)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLOB_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) return (await res.json()) as ClobBookResponse;
      // Retry transient 5xx and 429 (the shared-IP ~50 req/s rate limit); bail
      // only on other 4xx (bad/unknown token id).
      if (res.status !== 429 && res.status < 500) return null;
    } catch {
      // Network / abort — fall through to retry.
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, CLOB_RETRY_DELAY_MS));
    }
  }
  return null;
}

function softFallback(): QuoteSellResponse {
  return {
    proceeds: 0,
    filled_shares: 0,
    avg_price: 0,
    partial: true,
    book_updated_at: null,
    available_shares: null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return buildCorsPreflightResponse();
  }
  if (req.method !== 'POST') {
    return jsonWithCors({ error: 'Method not allowed' }, 405);
  }

  const authResult = await authorizeEdgeCall(req, {
    allowedRoles: ['user', 'manager', 'super_admin'],
  });
  if (!authResult.ok) {
    return jsonWithCors(authResult.body, authResult.status);
  }

  let body: QuoteSellRequest;
  try {
    body = (await req.json()) as QuoteSellRequest;
  } catch {
    return jsonWithCors({ error: 'Invalid JSON body' }, 400);
  }

  const tokenId = typeof body.polymarket_token_id === 'string' ? body.polymarket_token_id : '';
  const shares = typeof body.shares === 'number' ? body.shares : NaN;

  if (!tokenId) {
    return jsonWithCors({ error: 'polymarket_token_id must be a non-empty string' }, 400);
  }
  if (!Number.isFinite(shares) || shares <= 0 || shares > MAX_SHARES) {
    return jsonWithCors({ error: `shares must be a positive number <= ${MAX_SHARES}` }, 400);
  }

  const supabase = authResult.adminClient;

  // Confirm the token belongs to a known outcome before walking / caching.
  const { data: outcomeRow, error: outcomeErr } = await supabase
    .from('market_outcomes')
    .select('id')
    .eq('polymarket_token_id', tokenId)
    .maybeSingle();

  if (outcomeErr) {
    console.error('quote-sell: outcome lookup failed', outcomeErr);
    return jsonWithCors({ error: 'Outcome lookup failed' }, 500);
  }
  if (!outcomeRow) {
    return jsonWithCors({ error: 'Unknown polymarket_token_id' }, 404);
  }
  const outcomeId = outcomeRow.id as string;

  const book = await fetchClobBook(tokenId);
  if (!book || !Array.isArray(book.bids)) {
    console.warn('quote-sell: clob unreachable, returning soft fallback', { tokenId });
    return jsonWithCors(softFallback());
  }

  const walk = walkBids(book.bids, shares);

  // UPSERT the freshly-fetched top-N (both sides) as the canonical row, so the
  // subsequent sell_position -> quote_sell_proceeds walk returns the same
  // numbers we just computed and returned to the client.
  const asksFlat = serializeSide(book.asks ?? [], false);
  const bidsFlat = serializeSide(book.bids ?? [], true);

  // Report freshness from the ACTUAL DB write, never from the in-memory walk —
  // symmetric with quote-bet. sell_position gates on market_outcome_books.updated_at
  // (<=30s, DB clock); claiming a fresh book when the upsert never landed makes
  // sell_position reject with "Market book unavailable / stale". Read the row back
  // and only claim freshness when (a) we cached sell-side (bid) depth and (b) the
  // write landed. The returned value is the trigger-stamped updated_at.
  let bookUpdatedAt: string | null = null;
  if (asksFlat.length > 0 || bidsFlat.length > 0) {
    const { data: persisted, error: upsertErr } = await supabase
      .from('market_outcome_books')
      .upsert(
        {
          polymarket_token_id: tokenId,
          outcome_id: outcomeId,
          asks: asksFlat,
          bids: bidsFlat,
          hash: book.hash ?? null,
        },
        { onConflict: 'polymarket_token_id' }
      )
      .select('updated_at')
      .maybeSingle();
    if (upsertErr) {
      console.error('quote-sell: market_outcome_books upsert failed', upsertErr);
    } else if (!persisted) {
      console.error('quote-sell: market_outcome_books upsert returned no row');
    } else if (bidsFlat.length > 0 && typeof persisted.updated_at === 'string') {
      bookUpdatedAt = persisted.updated_at;
    }
  }

  const response: QuoteSellResponse = {
    proceeds: walk.proceeds,
    filled_shares: walk.filledShares,
    avg_price: walk.avgPrice,
    partial: walk.partial,
    book_updated_at: bookUpdatedAt,
    available_shares: walk.availableShares,
  };

  return jsonWithCors(response);
});
