// Edge Function: quote-bet
//
// Called by the BetSlip widget on every (debounced) stake change and once
// more at Confirm time. Computes a slippage-adjusted payout by walking the
// live Polymarket CLOB order book under the requested stake, and stores the
// top-N levels into market_outcome_books so the subsequent place_bet RPC
// reads a freshly-populated row (within the same ~1s window) and locks the
// same book-derived odds.
//
// Why this exists: the WS-driven population path (market-tracker bookWriter)
// is the long-term source of truth, but it depends on the service being
// deployed and subscribed to the right tokens. Until that's universally
// true, this function ensures BetSlip always shows accurate payouts that
// match Polymarket within <1%.
//
// Auth: in-function via authorizeEdgeCall (verify_jwt = false in config.toml,
// per project policy in CLAUDE.md).
// CLOB endpoint: https://clob.polymarket.com/book?token_id=<id> — public,
// CORS-friendly, ~50 req/s/IP rate limit. Soft-fails on 5xx/timeout — the
// client falls back to indicative odds when book_updated_at is null.

import { authorizeEdgeCall } from '../_shared/edgeAuth.ts';
import { buildCorsPreflightResponse, jsonWithCors } from '../_shared/cors.ts';
import { walkAsks, serializeSide, type BookLevel } from './walkAsks.ts';

const CLOB_BASE = Deno.env.get('POLYMARKET_CLOB_BASE') ?? 'https://clob.polymarket.com';
const CLOB_TIMEOUT_MS = 4_000;
const CLOB_RETRY_DELAY_MS = 200;
const MAX_STAKE = 100_000;

interface ClobBookResponse {
  market?: string;
  asset_id?: string;
  hash?: string;
  timestamp?: string;
  bids?: BookLevel[];
  asks?: BookLevel[];
}

interface QuoteBetRequest {
  polymarket_token_id?: unknown;
  stake?: unknown;
}

interface QuoteBetResponse {
  shares: number;
  filled_stake: number;
  avg_price: number;
  effective_odds: number;
  partial: boolean;
  book_updated_at: string | null;
  available_stake: number | null;
}

async function fetchClobBook(tokenId: string): Promise<ClobBookResponse | null> {
  const url = `${CLOB_BASE}/book?token_id=${encodeURIComponent(tokenId)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLOB_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) return (await res.json()) as ClobBookResponse;
      // Retry transient 5xx once; bail on 4xx (bad token id).
      if (res.status < 500) return null;
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

function softFallback(): QuoteBetResponse {
  // Returned when CLOB is unreachable or returned no usable data. Client
  // treats book_updated_at=null as "use indicative odds instead".
  return {
    shares: 0,
    filled_stake: 0,
    avg_price: 0,
    effective_odds: 0,
    partial: true,
    book_updated_at: null,
    available_stake: null,
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

  let body: QuoteBetRequest;
  try {
    body = (await req.json()) as QuoteBetRequest;
  } catch {
    return jsonWithCors({ error: 'Invalid JSON body' }, 400);
  }

  const tokenId = typeof body.polymarket_token_id === 'string' ? body.polymarket_token_id : '';
  const stake = typeof body.stake === 'number' ? body.stake : NaN;

  if (!tokenId) {
    return jsonWithCors({ error: 'polymarket_token_id must be a non-empty string' }, 400);
  }
  if (!Number.isFinite(stake) || stake <= 0 || stake > MAX_STAKE) {
    return jsonWithCors({ error: `stake must be a positive number <= ${MAX_STAKE}` }, 400);
  }

  const supabase = authResult.adminClient;

  // Confirm token belongs to a known outcome (otherwise we'd happily walk a
  // book for a random Polymarket token and write garbage rows). One indexed
  // lookup on a UNIQUE column — cheap.
  const { data: outcomeRow, error: outcomeErr } = await supabase
    .from('market_outcomes')
    .select('id')
    .eq('polymarket_token_id', tokenId)
    .maybeSingle();

  if (outcomeErr) {
    console.error('quote-bet: outcome lookup failed', outcomeErr);
    return jsonWithCors({ error: 'Outcome lookup failed' }, 500);
  }
  if (!outcomeRow) {
    return jsonWithCors({ error: 'Unknown polymarket_token_id' }, 404);
  }
  const outcomeId = outcomeRow.id as string;

  const book = await fetchClobBook(tokenId);
  if (!book || !Array.isArray(book.asks)) {
    // CLOB unreachable or empty — return soft fallback. Do NOT touch
    // market_outcome_books so we don't poison the cache for the WS pipeline.
    console.warn('quote-bet: clob unreachable, returning soft fallback', { tokenId });
    return jsonWithCors(softFallback());
  }

  const walk = walkAsks(book.asks, stake);

  // UPSERT the freshly-fetched top-N as the canonical row. Both the WS-driven
  // bookWriter and this edge function converge on the same flat numeric[]
  // representation, so subsequent place_bet → quote_bet_payout walks return
  // the same numbers we just computed and returned to the client.
  const nowIso = new Date().toISOString();
  const asksFlat = serializeSide(book.asks, false);
  const bidsFlat = serializeSide(book.bids ?? [], true);

  // Skip the write if the book is genuinely empty — there's nothing useful to
  // cache, and writing zero-length arrays would just churn updated_at.
  if (asksFlat.length > 0 || bidsFlat.length > 0) {
    const { error: upsertErr } = await supabase.from('market_outcome_books').upsert(
      {
        polymarket_token_id: tokenId,
        outcome_id: outcomeId,
        asks: asksFlat,
        bids: bidsFlat,
        hash: book.hash ?? null,
        updated_at: nowIso,
      },
      { onConflict: 'polymarket_token_id' }
    );
    if (upsertErr) {
      // Non-fatal: we still have a valid quote in memory. Log and move on.
      console.error('quote-bet: market_outcome_books upsert failed', upsertErr);
    }
  }

  const response: QuoteBetResponse = {
    shares: walk.shares,
    filled_stake: walk.filledStake,
    avg_price: walk.avgPrice,
    effective_odds: walk.effectiveOdds,
    partial: walk.partial,
    book_updated_at: asksFlat.length > 0 ? nowIso : null,
    available_stake: walk.availableStake,
  };

  return jsonWithCors(response);
});
