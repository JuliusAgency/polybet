// Edge Function: refresh-markets
// Fast refresh of odds for a specific set of markets (by polymarket_id).
// Called by the frontend every ~30s for currently visible markets.
// Auth: authenticated user (any role) — no admin required.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authorizeEdgeCall } from '../_shared/edgeAuth.ts';
import { buildCorsPreflightResponse, jsonWithCors } from '../_shared/cors.ts';
import { fetchGammaMarketsByConditionIds, buildConditionIdsUrl } from '../_shared/gammaUrls.ts';
import { fetchJsonWithRetry } from '../_shared/gammaFetch.ts';
import { resolveWinnerTokenId } from '../_shared/polymarketWinner.ts';

const MAX_MARKET_IDS = 20;

// ─── Gamma API types ──────────────────────────────────────────────────────────

interface GammaMarket {
  conditionId: string;
  outcomes: string; // JSON: '["Yes","No"]'
  outcomePrices: string; // JSON: '["0.62","0.38"]'
  clobTokenIds: string; // JSON: '["tokenId1","tokenId2"]'
  tokens?: Array<{ token_id: string; winner?: boolean }>;
  updatedAt?: string | null;
  active: boolean;
  closed: boolean;
  resolved: boolean;
}

function deriveMarketStatus(gm: GammaMarket): 'open' | 'closed' | 'resolved' {
  if (gm.resolved) return 'resolved';
  if (gm.closed || !gm.active) return 'closed';
  return 'open';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Floor `price` at 0.001 (0.1¢) for Polymarket parity — sub-cent prices are
// real and tradable on Polymarket, so we preserve them through the odds
// computation. The floor only guards against true-zero / negative inputs.
// Antifraud guarantees live in the place_bet RPC (drift tolerance + 3-min
// staleness). See market-tracker `batchWriter.ts` for the matching definition.
const MIN_TRADABLE_PRICE = 0.001;

function priceToOdds(price: number): number {
  if (!Number.isFinite(price) || price <= 0 || price > 1) return 1;
  const clamped = Math.max(MIN_TRADABLE_PRICE, price);
  return 1 / clamped;
}

function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return buildCorsPreflightResponse();
  }

  if (req.method !== 'POST') {
    return jsonWithCors({ error: 'Method not allowed' }, 405);
  }

  // Any authenticated user may call this (no admin role required)
  const authResult = await authorizeEdgeCall(req, {
    allowedRoles: ['user', 'manager', 'super_admin'],
  });

  if (!authResult.ok) {
    return jsonWithCors(authResult.body, authResult.status);
  }

  let body: { market_ids?: unknown };
  try {
    body = (await req.json()) as { market_ids?: unknown };
  } catch {
    return jsonWithCors({ error: 'Invalid JSON body' }, 400);
  }

  if (!Array.isArray(body.market_ids) || body.market_ids.length === 0) {
    return jsonWithCors({ error: 'market_ids must be a non-empty array' }, 400);
  }

  const marketIds = (body.market_ids as unknown[])
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .slice(0, MAX_MARKET_IDS);

  if (marketIds.length === 0) {
    return jsonWithCors({ error: 'No valid market_ids provided' }, 400);
  }

  const supabase = authResult.adminClient;

  // Fetch all markets in one batched request (paired closed=false/closed=true
  // calls under the hood, since Gamma hides closed markets by default — see
  // _shared/gammaUrls.ts). Replaces the previous N×1 single-id fetches.
  let gmMap: Map<string, GammaMarket>;
  let batchError: Error | null = null;
  try {
    gmMap = await fetchGammaMarketsByConditionIds<GammaMarket>(marketIds, {
      timeoutMs: 10_000,
      maxAttempts: 2,
    });
  } catch (e: unknown) {
    gmMap = new Map();
    batchError = e instanceof Error ? e : new Error(String(e));
  }

  const results: PromiseSettledResult<GammaMarket>[] = marketIds.map((cid) => {
    const gm = gmMap.get(cid);
    if (gm) return { status: 'fulfilled', value: gm };
    return {
      status: 'rejected',
      reason: batchError ?? new Error('Market not found in Gamma API'),
    };
  });

  const changedAt = new Date().toISOString();
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const conditionId = marketIds[i];

    if (result.status === 'rejected') {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`${conditionId}: ${reason}`);

      // Still update last_synced_at so the UI knows we attempted a sync,
      // preventing permanent "Stale data" for markets the Gamma API no longer serves.
      await supabase
        .from('markets')
        .update({ last_synced_at: changedAt })
        .eq('polymarket_id', conditionId);

      updated++;
      continue;
    }

    const gm = result.value;

    try {
      // Resolve internal market id + current winning_outcome_id
      const { data: marketRow, error: marketErr } = await supabase
        .from('markets')
        .select('id, winning_outcome_id')
        .eq('polymarket_id', gm.conditionId)
        .maybeSingle();

      if (marketErr || !marketRow) {
        errors.push(`${conditionId}: market not found in db`);
        continue;
      }

      const marketId = marketRow.id as string;
      const newStatus = deriveMarketStatus(gm);

      const names = parseJsonField<string[]>(gm.outcomes, []);
      const prices = parseJsonField<string[]>(gm.outcomePrices, []);
      const tokenIds = parseJsonField<string[]>(gm.clobTokenIds, []);

      if (names.length === 0) {
        errors.push(`${conditionId}: no outcomes in API response`);
        continue;
      }

      // Preserve the actual price coming back from Polymarket — including 0.
      // The previous "0 → 0.5" substitution injected a fake 50% probability for
      // genuinely zero-priced outcomes (e.g. the losing side of a resolved
      // market where Polymarket returns [0, 1]) and surfaced as wrong %/odds.
      // priceToOdds already handles price <= 0 safely.
      const outcomeRows = names
        .map((name, i) => {
          const raw = parseFloat(prices[i] ?? '');
          const price = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
          const odds = priceToOdds(price);
          return {
            market_id: marketId,
            polymarket_token_id: tokenIds[i] ?? null,
            name,
            price,
            odds,
            effective_odds: odds,
            updated_at: changedAt,
          };
        })
        .filter((r) => r.polymarket_token_id !== null);

      if (outcomeRows.length === 0) continue;

      // Update status + last_synced_at BEFORE outcomes upsert.
      // Realtime subscribes to market_outcomes changes and triggers a refetch.
      // If last_synced_at is written after the upsert, the Realtime-triggered
      // refetch reads the OLD timestamp — causing the UI to show stale data.
      const { error: updateErr } = await supabase
        .from('markets')
        .update({ status: newStatus, last_synced_at: changedAt })
        .eq('id', marketId);

      if (updateErr) {
        console.error(
          `[refresh-markets] Failed to update last_synced_at for ${marketId}:`,
          updateErr.message
        );
        errors.push(`${conditionId}: market update failed: ${updateErr.message}`);
        continue;
      } else {
        console.log(
          `[refresh-markets] Updated ${marketId}: status=${newStatus}, last_synced_at=${changedAt}`
        );
      }

      const { error: upsertErr } = await supabase
        .from('market_outcomes')
        .upsert(outcomeRows, { onConflict: 'market_id,polymarket_token_id' });

      if (upsertErr) {
        errors.push(`${conditionId}: outcomes upsert failed: ${upsertErr.message}`);
        // last_synced_at was already updated — still count as updated
      }

      // Settle if resolved and not yet settled
      if (newStatus === 'resolved' && !marketRow.winning_outcome_id) {
        const winnerTokenId = await resolveWinnerTokenId({
          market: gm,
          fetchMarketDetails: async () => {
            try {
              // closed=true is mandatory here — by the time we reach this branch
              // the market is `resolved`, so the default-hides-closed filter
              // would return [] and resolveWinnerTokenId would never get
              // payload data for the price-fallback path.
              const items = await fetchJsonWithRetry<GammaMarket[]>(
                buildConditionIdsUrl([conditionId], { closed: true, limit: 1 }),
                { headers: { Accept: 'application/json' }, timeoutMs: 10_000, maxAttempts: 2 }
              );
              return Array.isArray(items) && items.length > 0 ? items[0] : null;
            } catch {
              return null;
            }
          },
        });

        if (winnerTokenId) {
          const { data: winnerOutcome } = await supabase
            .from('market_outcomes')
            .select('id')
            .eq('market_id', marketId)
            .eq('polymarket_token_id', winnerTokenId)
            .maybeSingle();

          if (winnerOutcome) {
            await supabase.rpc('settle_market', {
              p_market_id: marketId,
              p_winning_outcome_id: winnerOutcome.id,
            });
          } else {
            errors.push(`${conditionId}: winner outcome not found for token ${winnerTokenId}`);
          }
        } else {
          errors.push(`${conditionId}: resolved but winner token not determinable`);
        }
      }

      updated++;
    } catch (e: unknown) {
      errors.push(`${conditionId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return jsonWithCors({
    updated,
    requested: marketIds.length,
    timestamp: changedAt,
    ...(errors.length > 0 ? { errors } : {}),
  });
});
