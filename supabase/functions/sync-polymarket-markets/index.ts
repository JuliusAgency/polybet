// Edge Function: sync-polymarket-markets
// Fetches markets from Polymarket Gamma API and upserts into markets + market_outcomes.
// Also detects resolved markets and triggers settlement via settle_market RPC.
// Invoked on a schedule (configured in Supabase Dashboard) or manually via HTTP GET/POST.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Gamma API types (actual field names from gamma-api.polymarket.com) ────────

interface GammaMarket {
  conditionId: string;      // 0x... hash — used as polymarket_id
  question: string;
  slug: string;
  endDate: string | null;   // ISO date string
  active: boolean;
  closed: boolean;
  resolved: boolean;
  outcomes: string;         // JSON string: e.g. '["Yes","No"]'
  outcomePrices: string;    // JSON string: e.g. '["0.62","0.38"]' — winner has "1"
  clobTokenIds: string;     // JSON string: e.g. '["tokenId1","tokenId2"]'
  volume: string | number;
  liquidity: string | number;
  image: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';
const ACTIVE_MARKETS_URL = `${GAMMA_API_BASE}/markets?active=true&closed=false&limit=100`;
const RESOLVED_MARKETS_URL = `${GAMMA_API_BASE}/markets?resolved=true&limit=50`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function priceToOdds(price: number): number {
  if (!Number.isFinite(price) || price <= 0 || price > 1) return 1;
  return 1 / price;
}

function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

/** Fetch pages from a Gamma API URL (handles offset pagination).
 *  @param maxPages - max number of pages to fetch (0 = unlimited) */
async function fetchGammaMarkets(baseUrl: string, maxPages = 0): Promise<GammaMarket[]> {
  const markets: GammaMarket[] = [];
  let offset = 0;
  let pages = 0;
  const urlObj = new URL(baseUrl);
  const limit = parseInt(urlObj.searchParams.get('limit') ?? '100', 10);

  while (true) {
    const url = `${baseUrl}&offset=${offset}`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (!response.ok) {
      throw new Error(`Gamma API error ${response.status}: ${await response.text()}`);
    }

    const page: GammaMarket[] = await response.json();
    if (!Array.isArray(page) || page.length === 0) break;

    markets.push(...page);
    pages++;

    if (page.length < limit) break;
    if (maxPages > 0 && pages >= maxPages) break;
    offset += limit;
  }

  return markets;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } },
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

  const stats = {
    markets_synced: 0,
    outcomes_updated: 0,
    markets_settled: 0,
    errors: [] as string[],
  };

  try {
    // ── 1. Read sync_auto_show_all setting ────────────────────────────────────
    const { data: settingRow, error: settingErr } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'sync_auto_show_all')
      .maybeSingle();

    if (settingErr) {
      stats.errors.push(`Failed to read system_settings: ${settingErr.message}`);
    }

    const autoShowAll: boolean =
      settingRow?.value === true || settingRow?.value === 'true';

    // ── 2. Fetch markets from Gamma API ───────────────────────────────────────
    // max_pages query param: limits pages fetched (useful for testing). 0 = unlimited.
    const reqUrl = new URL(req.url);
    const maxPages = parseInt(reqUrl.searchParams.get('max_pages') ?? '0', 10);

    const [activeMarkets, resolvedMarkets] = await Promise.all([
      fetchGammaMarkets(ACTIVE_MARKETS_URL, maxPages).catch((e: unknown) => {
        stats.errors.push(`Failed to fetch active markets: ${e instanceof Error ? e.message : String(e)}`);
        return [] as GammaMarket[];
      }),
      fetchGammaMarkets(RESOLVED_MARKETS_URL, maxPages).catch((e: unknown) => {
        stats.errors.push(`Failed to fetch resolved markets: ${e instanceof Error ? e.message : String(e)}`);
        return [] as GammaMarket[];
      }),
    ]);

    // ── 3. Upsert active markets ──────────────────────────────────────────────
    for (const gm of activeMarkets) {
      try {
        await upsertMarket(supabase, gm, 'open', autoShowAll, stats);
      } catch (e: unknown) {
        stats.errors.push(`Error upserting active market ${gm.conditionId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ── 4. Process resolved markets ───────────────────────────────────────────
    for (const gm of resolvedMarkets) {
      try {
        await processResolvedMarket(supabase, gm, autoShowAll, stats);
      } catch (e: unknown) {
        stats.errors.push(`Error processing resolved market ${gm.conditionId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e: unknown) {
    stats.errors.push(`Unexpected sync error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const success = stats.errors.length === 0;
  return new Response(
    JSON.stringify({ success, ...stats }),
    { status: success ? 200 : 207, headers: { 'Content-Type': 'application/json' } },
  );
});

// ─── upsertMarket ─────────────────────────────────────────────────────────────

async function upsertMarket(
  supabase: ReturnType<typeof createClient>,
  gm: GammaMarket,
  status: 'open' | 'closed',
  autoShowAll: boolean,
  stats: { markets_synced: number; outcomes_updated: number; errors: string[] },
): Promise<void> {
  const { data: existing } = await supabase
    .from('markets')
    .select('id, is_visible')
    .eq('polymarket_id', gm.conditionId)
    .maybeSingle();

  const marketStatus: 'open' | 'closed' =
    gm.closed && !gm.resolved ? 'closed' : status;

  const marketRow = {
    polymarket_id:   gm.conditionId,
    question:        gm.question,
    status:          marketStatus,
    close_at:        gm.endDate ?? null,
    liquidity:       parseFloat(String(gm.liquidity)) || 0,
    volume:          parseFloat(String(gm.volume)) || 0,
    image_url:       gm.image ?? null,
    polymarket_slug: gm.slug ?? null,
    ...(existing === null ? { is_visible: autoShowAll } : {}),
  };

  const { error: upsertErr } = await supabase
    .from('markets')
    .upsert(marketRow, { onConflict: 'polymarket_id' });

  if (upsertErr) throw new Error(`markets upsert: ${upsertErr.message}`);
  stats.markets_synced++;

  const marketId: string = existing?.id ?? await resolveMarketId(supabase, gm.conditionId);
  await upsertOutcomes(supabase, marketId, gm, stats);
}

/** Fetch the internal UUID for a market by polymarket_id. */
async function resolveMarketId(
  supabase: ReturnType<typeof createClient>,
  polymarketId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('markets')
    .select('id')
    .eq('polymarket_id', polymarketId)
    .single();

  if (error || !data) throw new Error(`Cannot resolve market id for ${polymarketId}`);
  return data.id as string;
}

// ─── upsertOutcomes ────────────────────────────────────────────────────────────

async function upsertOutcomes(
  supabase: ReturnType<typeof createClient>,
  marketId: string,
  gm: GammaMarket,
  stats: { outcomes_updated: number; errors: string[] },
): Promise<void> {
  const names      = parseJsonField<string[]>(gm.outcomes, []);
  const prices     = parseJsonField<string[]>(gm.outcomePrices, []);
  const tokenIds   = parseJsonField<string[]>(gm.clobTokenIds, []);

  if (names.length === 0) {
    stats.errors.push(`No outcomes for market ${gm.conditionId}`);
    return;
  }

  const rows = names.map((name, i) => {
    const price = parseFloat(prices[i] ?? '0');
    const odds = priceToOdds(price > 0 ? price : 0.5);
    return {
      market_id:           marketId,
      polymarket_token_id: tokenIds[i] ?? null,
      name,
      odds,
      effective_odds:      odds,
      updated_at:          new Date().toISOString(),
    };
  }).filter((r) => r.polymarket_token_id !== null);

  if (rows.length === 0) return;

  const { error } = await supabase.from('market_outcomes').upsert(rows, {
    onConflict: 'market_id,polymarket_token_id',
  });

  if (error) throw new Error(`market_outcomes upsert: ${error.message}`);
  stats.outcomes_updated += rows.length;
}

// ─── processResolvedMarket ────────────────────────────────────────────────────

async function processResolvedMarket(
  supabase: ReturnType<typeof createClient>,
  gm: GammaMarket,
  autoShowAll: boolean,
  stats: { markets_synced: number; outcomes_updated: number; markets_settled: number; errors: string[] },
): Promise<void> {
  const { data: existing } = await supabase
    .from('markets')
    .select('id, status, is_visible')
    .eq('polymarket_id', gm.conditionId)
    .maybeSingle();

  if (existing?.status === 'resolved') return;

  const marketRow = {
    polymarket_id:   gm.conditionId,
    question:        gm.question,
    status:          'closed' as const,
    close_at:        gm.endDate ?? null,
    liquidity:       parseFloat(String(gm.liquidity)) || 0,
    volume:          parseFloat(String(gm.volume)) || 0,
    image_url:       gm.image ?? null,
    polymarket_slug: gm.slug ?? null,
    ...(existing === null ? { is_visible: autoShowAll } : {}),
  };

  const { error: upsertErr } = await supabase
    .from('markets')
    .upsert(marketRow, { onConflict: 'polymarket_id' });

  if (upsertErr) throw new Error(`markets upsert (resolved): ${upsertErr.message}`);
  stats.markets_synced++;

  const marketId: string = existing?.id ?? await resolveMarketId(supabase, gm.conditionId);
  await upsertOutcomes(supabase, marketId, gm, stats);

  // Find winner: resolved markets have outcomePrices["1", "0"] or ["0", "1"]
  // The winning outcome has price = "1"
  const prices   = parseJsonField<string[]>(gm.outcomePrices, []);
  const tokenIds = parseJsonField<string[]>(gm.clobTokenIds, []);
  const winnerIndex = prices.findIndex((p) => parseFloat(p) >= 0.99);

  if (winnerIndex === -1) {
    stats.errors.push(`Resolved market ${gm.conditionId}: cannot determine winner from prices ${gm.outcomePrices}`);
    return;
  }

  const winnerTokenId = tokenIds[winnerIndex];
  if (!winnerTokenId) {
    stats.errors.push(`Resolved market ${gm.conditionId}: no token ID for winner at index ${winnerIndex}`);
    return;
  }

  const { data: winnerOutcome, error: outcomeErr } = await supabase
    .from('market_outcomes')
    .select('id')
    .eq('market_id', marketId)
    .eq('polymarket_token_id', winnerTokenId)
    .maybeSingle();

  if (outcomeErr || !winnerOutcome) {
    stats.errors.push(`Cannot find winner outcome for market ${gm.conditionId} (token ${winnerTokenId})`);
    return;
  }

  const { data: settlementResult, error: settleErr } = await supabase
    .rpc('settle_market', {
      p_market_id:          marketId,
      p_winning_outcome_id: winnerOutcome.id,
    });

  if (settleErr) throw new Error(`settle_market RPC failed: ${settleErr.message}`);

  console.log(`Settled market ${gm.conditionId}:`, settlementResult);
  stats.markets_settled++;
}
