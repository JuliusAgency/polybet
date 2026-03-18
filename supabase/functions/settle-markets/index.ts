// Edge Function: settle-markets
// Accepts POST { market_id: string, winning_outcome_id?: string }
// If winning_outcome_id is not provided, looks it up from market_outcomes
// where the stored polymarket winner token matches.
// Delegates actual settlement to the settle_market SQL RPC.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface SettleRequest {
  market_id: string;
  winning_outcome_id?: string;
}

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Authorization: must be service role key
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Parse body
  let body: SettleRequest;
  try {
    body = (await req.json()) as SettleRequest;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { market_id, winning_outcome_id } = body;

  if (!market_id) {
    return new Response(
      JSON.stringify({ error: 'market_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing Supabase env vars' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // ── 1. Verify market exists and is not already resolved ───────────────────
    const { data: market, error: marketErr } = await supabase
      .from('markets')
      .select('id, status, polymarket_id')
      .eq('id', market_id)
      .maybeSingle();

    if (marketErr) {
      return new Response(
        JSON.stringify({ success: false, error: `DB error: ${marketErr.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!market) {
      return new Response(
        JSON.stringify({ success: false, error: 'Market not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (market.status === 'resolved') {
      return new Response(
        JSON.stringify({ success: false, error: 'Market is already resolved' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
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
        return new Response(
          JSON.stringify({
            success: false,
            error:
              'winning_outcome_id not provided and could not be determined from Polymarket API',
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── 3. Call settle_market RPC ─────────────────────────────────────────────
    const { data: result, error: settleErr } = await supabase.rpc('settle_market', {
      p_market_id:          market_id,
      p_winning_outcome_id: resolvedWinnerOutcomeId,
    });

    if (settleErr) {
      return new Response(
        JSON.stringify({ success: false, error: settleErr.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // result shape: { settled: number, winners: number, losers: number }
    const { settled, winners, losers } = (result as { settled: number; winners: number; losers: number }) ?? {};

    return new Response(
      JSON.stringify({
        success: true,
        market_id,
        winning_outcome_id: resolvedWinnerOutcomeId,
        settled:            settled ?? 0,
        winners:            winners ?? 0,
        losers:             losers  ?? 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
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
