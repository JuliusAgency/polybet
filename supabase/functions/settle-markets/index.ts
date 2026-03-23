// Edge Function: settle-markets
// Accepts POST { market_id: string, winning_outcome_id?: string }
// If winning_outcome_id is not provided, looks it up from market_outcomes
// where the stored polymarket winner token matches.
// Delegates actual settlement to the settle_market SQL RPC.

import { authorizeEdgeCall } from '../_shared/edgeAuth.ts';
import { buildCorsPreflightResponse, jsonWithCors } from '../_shared/cors.ts';

interface SettleRequest {
  market_id: string;
  winning_outcome_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return buildCorsPreflightResponse('POST, OPTIONS');
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return jsonWithCors({ error: 'Method not allowed. Use POST.' }, 405);
  }

  // Parse body
  let body: SettleRequest;
  try {
    body = (await req.json()) as SettleRequest;
  } catch {
    return jsonWithCors({ error: 'Invalid JSON body' }, 400);
  }

  const { market_id, winning_outcome_id } = body;

  if (!market_id) {
    return jsonWithCors({ error: 'market_id is required' }, 400);
  }

  const authResult = await authorizeEdgeCall(req, {
    allowServiceRole: true,
  });

  if (!authResult.ok || !authResult.isServiceRole) {
    if (!authResult.ok) {
      return jsonWithCors(authResult.body, authResult.status);
    }

    return jsonWithCors({ error: 'Forbidden' }, 403);
  }

  const supabase = authResult.adminClient;

  try {
    // ── 1. Verify market exists and is not already resolved ───────────────────
    const { data: market, error: marketErr } = await supabase
      .from('markets')
      .select('id, status, polymarket_id')
      .eq('id', market_id)
      .maybeSingle();

    if (marketErr) {
      return jsonWithCors({ success: false, error: `DB error: ${marketErr.message}` }, 500);
    }

    if (!market) {
      return jsonWithCors({ success: false, error: 'Market not found' }, 404);
    }

    if (market.status === 'resolved') {
      return jsonWithCors({ success: false, error: 'Market is already resolved' }, 409);
    }

    // ── 2. Resolve winning_outcome_id if not provided ─────────────────────────
    let resolvedWinnerOutcomeId = winning_outcome_id;

    if (!resolvedWinnerOutcomeId) {
      // Attempt to look up from Gamma API using the stored polymarket_id
      resolvedWinnerOutcomeId = await lookupWinnerFromGamma(
        supabase,
        market_id,
        market.polymarket_id as string,
      );

      if (!resolvedWinnerOutcomeId) {
        return jsonWithCors({
          success: false,
          error:
            'winning_outcome_id not provided and could not be determined from Polymarket API',
        }, 422);
      }
    }

    // ── 3. Call settle_market RPC ─────────────────────────────────────────────
    const { data: result, error: settleErr } = await supabase.rpc('settle_market', {
      p_market_id:          market_id,
      p_winning_outcome_id: resolvedWinnerOutcomeId,
    });

    if (settleErr) {
      return jsonWithCors({ success: false, error: settleErr.message }, 500);
    }

    // result shape: { settled: number, winners: number, losers: number }
    const { settled, winners, losers } = (result as { settled: number; winners: number; losers: number }) ?? {};

    return jsonWithCors({
      success: true,
      market_id,
      winning_outcome_id: resolvedWinnerOutcomeId,
      settled:            settled ?? 0,
      winners:            winners ?? 0,
      losers:             losers  ?? 0,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return jsonWithCors({ success: false, error: message }, 500);
  }
});

// ─── lookupWinnerFromGamma ─────────────────────────────────────────────────────
// Fetches the Gamma API for this specific market and finds the winner token,
// then resolves it to our internal outcome id.

async function lookupWinnerFromGamma(
  supabase: ReturnType<typeof createClient>,
  marketId: string,
  polymarketId: string,
): Promise<string | undefined> {
  try {
    const url = `https://gamma-api.polymarket.com/markets/${polymarketId}`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return undefined;

    const gm = (await resp.json()) as {
      tokens?: Array<{ token_id: string; outcome: string; winner: boolean }>;
    };

    const winnerToken = gm.tokens?.find((t) => t.winner === true);
    if (!winnerToken) return undefined;

    // Look up our internal outcome id by polymarket_token_id
    const { data: outcome } = await supabase
      .from('market_outcomes')
      .select('id')
      .eq('market_id', marketId)
      .eq('polymarket_token_id', winnerToken.token_id)
      .maybeSingle();

    return outcome?.id as string | undefined;
  } catch {
    return undefined;
  }
}
