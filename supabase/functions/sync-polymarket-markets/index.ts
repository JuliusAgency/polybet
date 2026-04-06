// Edge Function: sync-polymarket-markets
// Fetches markets from Polymarket Gamma API and upserts into markets + market_outcomes.
// Also detects resolved markets and triggers settlement via settle_market RPC.
// Invoked on a schedule (configured in Supabase Dashboard) or manually via HTTP GET/POST.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authorizeEdgeCall } from '../_shared/edgeAuth.ts';
import { buildCorsPreflightResponse, jsonWithCors } from '../_shared/cors.ts';
import { fetchJsonWithRetry } from '../_shared/gammaFetch.ts';
import { buildArchiveCutoffIso, parseArchiveAfterHours } from '../_shared/marketLifecycle.ts';
import {
  buildMarketCreatedDelta,
  buildMarketResolvedDelta,
  buildMarketStatusDelta,
  buildOutcomePriceDeltas,
  type MarketDataDeltaInsert,
} from '../_shared/marketDataDelta.ts';
import { resolveWinnerTokenId } from '../_shared/polymarketWinner.ts';
import {
  buildCompletedProgressUpdate,
  buildFailedProgressUpdate,
  buildFetchedProgressUpdate,
  buildIncrementedProgressUpdate,
  buildStartedProgressUpdate,
} from '../_shared/syncRunProgress.ts';

// ─── Gamma API types (actual field names from gamma-api.polymarket.com) ────────

interface GammaMarket {
  conditionId: string; // 0x... hash — used as polymarket_id
  question: string;
  slug: string;
  endDate: string | null; // ISO date string
  active: boolean;
  closed: boolean;
  resolved: boolean;
  outcomes: string; // JSON string: e.g. '["Yes","No"]'
  outcomePrices: string; // JSON string: e.g. '["0.62","0.38"]' — winner has "1"
  clobTokenIds: string; // JSON string: e.g. '["tokenId1","tokenId2"]'
  volume: string | number;
  liquidity: string | number;
  image: string | null;
  category?: string | null;
  tokens?: Array<{ token_id: string; winner?: boolean }>;
  updatedAt?: string | null;
  resolutionDate?: string | null;
}

interface SyncRequestBody {
  run_id?: string;
  mode?: 'full' | 'resolved_only' | 'active_page' | 'backfill' | 'hot_set';
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';
const ACTIVE_MARKETS_URL = `${GAMMA_API_BASE}/markets?active=true&closed=false&limit=100`;
const RESOLVED_MARKETS_URL = `${GAMMA_API_BASE}/markets?resolved=true&limit=50`;
const DEFAULT_ARCHIVE_AFTER_HOURS = 168;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function priceToOdds(price: number): number {
  if (!Number.isFinite(price) || price <= 0 || price > 1) return 1;
  return 1 / price;
}

function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function buildPolymarketStatusRaw(gm: GammaMarket): string {
  return `active:${gm.active};closed:${gm.closed};resolved:${gm.resolved}`;
}

/** Fetch pages from a Gamma API URL (handles offset pagination).
 *  @param maxPages    - max number of pages to fetch (0 = unlimited)
 *  @param startOffset - initial pagination offset (default 0) */
async function fetchGammaMarkets(
  baseUrl: string,
  maxPages = 0,
  startOffset = 0,
  onPageFetched?: (params: { fetchedCount: number; pagesFetched: number }) => Promise<void> | void,
  onHeartbeat?: (params: {
    fetchedCount: number;
    pagesFetched: number;
    attempt: number;
  }) => Promise<void> | void
): Promise<GammaMarket[]> {
  const markets: GammaMarket[] = [];
  let offset = startOffset;
  let pages = 0;
  const urlObj = new URL(baseUrl);
  const limit = parseInt(urlObj.searchParams.get('limit') ?? '100', 10);

  while (true) {
    const url = `${baseUrl}&offset=${offset}`;
    const page = await fetchJsonWithRetry<GammaMarket[]>(url, {
      headers: { Accept: 'application/json' },
      onHeartbeat: ({ attempt }) => {
        void onHeartbeat?.({
          fetchedCount: markets.length,
          pagesFetched: pages,
          attempt,
        });
      },
    });

    if (!Array.isArray(page) || page.length === 0) break;

    markets.push(...page);
    pages++;
    await onPageFetched?.({
      fetchedCount: markets.length,
      pagesFetched: pages,
    });

    if (page.length < limit) break;
    if (maxPages > 0 && pages >= maxPages) break;
    offset += limit;
  }

  return markets;
}

async function fetchGammaMarketDetails(conditionId: string): Promise<GammaMarket | null> {
  try {
    const items = await fetchJsonWithRetry<GammaMarket[]>(
      `${GAMMA_API_BASE}/markets?condition_ids=${conditionId}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!Array.isArray(items) || items.length === 0) return null;
    return items[0];
  } catch {
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return buildCorsPreflightResponse();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonWithCors({ error: 'Method not allowed' }, 405);
  }

  const authResult = await authorizeEdgeCall(req, {
    allowServiceRole: true,
    allowedRoles: ['super_admin'],
  });

  if (!authResult.ok) {
    return jsonWithCors(authResult.body, authResult.status);
  }

  const supabase = authResult.adminClient;
  const now = new Date().toISOString();

  let body: SyncRequestBody = {};
  if (req.method === 'POST') {
    const rawBody = await req.text();
    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody) as SyncRequestBody;
      } catch {
        return jsonWithCors({ error: 'Invalid JSON body' }, 400);
      }
    }
  }

  const reqUrl = new URL(req.url);
  const maxPages = parseInt(reqUrl.searchParams.get('max_pages') ?? '0', 10);
  const runId = body.run_id ?? crypto.randomUUID();
  const mode = body.mode ?? 'full';

  let totalCount = 0;
  let processedCount = 0;

  const stats = {
    markets_synced: 0,
    outcomes_updated: 0,
    markets_settled: 0,
    errors: [] as string[],
  };

  const { error: insertRunErr } = await supabase.from('sync_runs').upsert(
    {
      id: runId,
      created_by: authResult.isServiceRole ? null : authResult.callerId,
      created_at: now,
      started_at: now,
      updated_at: now,
      ...buildStartedProgressUpdate(maxPages),
    },
    { onConflict: 'id' }
  );

  if (insertRunErr) {
    return jsonWithCors({ error: 'internal_error', details: insertRunErr.message }, 500);
  }

  const updateRun = async (patch: Record<string, unknown>) => {
    const { error } = await supabase
      .from('sync_runs')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId);

    if (error) {
      console.error('sync_runs update failed:', error.message);
    }
  };

  const runSync = async () => {
    try {
      // ── 1. Read sync_auto_show_all setting ──────────────────────────────────
      const { data: settingRow, error: settingErr } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'sync_auto_show_all')
        .maybeSingle();

      if (settingErr) {
        stats.errors.push(`Failed to read system_settings: ${settingErr.message}`);
      }

      const autoShowAll: boolean = settingRow?.value === true || settingRow?.value === 'true';

      const { data: archiveSettingRow, error: archiveSettingErr } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'archive_after_hours')
        .maybeSingle();

      if (archiveSettingErr) {
        stats.errors.push(
          `Failed to read archive_after_hours setting: ${archiveSettingErr.message}`
        );
      }

      const archiveAfterHours = parseArchiveAfterHours(
        archiveSettingRow?.value,
        DEFAULT_ARCHIVE_AFTER_HOURS
      );

      // ── mode: resolved_only — settle open bets for recently resolved markets ─
      if (mode === 'resolved_only') {
        await updateRun({ phase: 'fetching_resolved' });

        const resolvedMarkets = await fetchGammaMarkets(
          RESOLVED_MARKETS_URL,
          2, // max 2 pages (~100 recently resolved markets)
          0,
          ({ fetchedCount }) =>
            updateRun({
              phase: 'fetching_resolved',
              progress_current: fetchedCount,
              progress_total: 0,
            }),
          ({ fetchedCount }) =>
            updateRun({
              phase: 'fetching_resolved',
              progress_current: fetchedCount,
              progress_total: 0,
            })
        ).catch((e: unknown) => {
          stats.errors.push(
            `Failed to fetch resolved markets: ${e instanceof Error ? e.message : String(e)}`
          );
          return [] as GammaMarket[];
        });

        totalCount = resolvedMarkets.length;
        await updateRun(buildFetchedProgressUpdate(0, resolvedMarkets.length));

        for (const gm of resolvedMarkets) {
          try {
            await processResolvedMarket(supabase, gm, autoShowAll, runId, stats);
          } catch (e: unknown) {
            stats.errors.push(
              `Error processing resolved market ${gm.conditionId}: ${e instanceof Error ? e.message : String(e)}`
            );
          }
          processedCount++;
          await updateRun({
            ...buildIncrementedProgressUpdate({
              processedCount,
              activeCount: 0,
              totalCount,
            }),
            markets_synced: stats.markets_synced,
            outcomes_updated: stats.outcomes_updated,
            markets_settled: stats.markets_settled,
            errors: stats.errors,
            error_message: stats.errors[0] ?? null,
          });
        }

        await archiveResolvedMarkets(supabase, archiveAfterHours, stats);
        await updateRun(buildCompletedProgressUpdate({ processedCount, totalCount, stats }));
        return;
      }

      // ── mode: backfill — settle any open bets whose market resolved on Polymarket ─
      if (mode === 'backfill') {
        await updateRun({ phase: 'syncing_resolved' });

        // Step 1: collect distinct market IDs that have open bets
        const { data: openBetRows, error: betsErr } = await supabase
          .from('bets')
          .select('market_id')
          .eq('status', 'open');

        if (betsErr || !Array.isArray(openBetRows)) {
          stats.errors.push(
            `Failed to fetch open bets: ${betsErr?.message ?? 'unexpected format'}`
          );
          await archiveResolvedMarkets(supabase, archiveAfterHours, stats);
          await updateRun(
            buildCompletedProgressUpdate({ processedCount: 0, totalCount: 0, stats })
          );
          return;
        }

        const marketIds = [
          ...new Set(openBetRows.map((b) => b.market_id).filter(Boolean) as string[]),
        ];

        if (marketIds.length === 0) {
          await archiveResolvedMarkets(supabase, archiveAfterHours, stats);
          await updateRun(
            buildCompletedProgressUpdate({ processedCount: 0, totalCount: 0, stats })
          );
          return;
        }

        // Step 2: load market rows, skip already-resolved ones
        const { data: openMarkets, error: marketsErr } = await supabase
          .from('markets')
          .select('id, polymarket_id')
          .in('id', marketIds)
          .neq('status', 'resolved');

        if (marketsErr || !Array.isArray(openMarkets)) {
          stats.errors.push(
            `Failed to fetch market details: ${marketsErr?.message ?? 'unexpected format'}`
          );
          await archiveResolvedMarkets(supabase, archiveAfterHours, stats);
          await updateRun(
            buildCompletedProgressUpdate({ processedCount: 0, totalCount: 0, stats })
          );
          return;
        }

        // Deduplicate by polymarket_id (polymarket_id is unique in schema; safety measure only)
        const unique = [...new Map(openMarkets.map((m) => [m.polymarket_id, m])).values()];
        totalCount = unique.length;
        await updateRun(buildFetchedProgressUpdate(0, unique.length)); // activeCount=0 → phase stays 'syncing_resolved'

        // Step 3: for each market, fetch from Polymarket and settle if resolved
        for (const { polymarket_id } of unique) {
          try {
            const gm = await fetchGammaMarketDetails(polymarket_id);
            if (gm?.resolved) {
              await processResolvedMarket(supabase, gm, autoShowAll, runId, stats);
            }
          } catch (e: unknown) {
            stats.errors.push(
              `Backfill check failed for ${polymarket_id}: ${e instanceof Error ? e.message : String(e)}`
            );
          }
          processedCount++;
          await updateRun({
            ...buildIncrementedProgressUpdate({ processedCount, activeCount: 0, totalCount }),
            markets_synced: stats.markets_synced,
            outcomes_updated: stats.outcomes_updated,
            markets_settled: stats.markets_settled,
            errors: stats.errors,
            error_message: stats.errors[0] ?? null,
          });
        }

        await archiveResolvedMarkets(supabase, archiveAfterHours, stats);
        await updateRun(buildCompletedProgressUpdate({ processedCount, totalCount, stats }));
        return;
      }

      // ── mode: hot_set — fast refresh of visible + in-play markets every minute ─
      if (mode === 'hot_set') {
        await updateRun({ phase: 'syncing_active' });

        const { data: visibleMarkets, error: visibleErr } = await supabase
          .from('markets')
          .select('id, polymarket_id')
          .eq('is_visible', true)
          .in('status', ['open', 'closed']);

        if (visibleErr) {
          stats.errors.push(`Failed to fetch visible markets for hot_set: ${visibleErr.message}`);
        }

        const { data: openBetRows, error: openBetsErr } = await supabase
          .from('bets')
          .select('market_id')
          .eq('status', 'open');

        if (openBetsErr) {
          stats.errors.push(`Failed to fetch open bets for hot_set: ${openBetsErr.message}`);
        }

        const openBetMarketIds = [
          ...new Set((openBetRows ?? []).map((row) => row.market_id).filter(Boolean) as string[]),
        ];

        let inPlayMarkets: Array<{ id: string; polymarket_id: string }> = [];
        if (openBetMarketIds.length > 0) {
          const { data: inPlayRows, error: inPlayErr } = await supabase
            .from('markets')
            .select('id, polymarket_id')
            .in('id', openBetMarketIds)
            .neq('status', 'resolved');

          if (inPlayErr) {
            stats.errors.push(`Failed to fetch in-play markets for hot_set: ${inPlayErr.message}`);
          } else {
            inPlayMarkets = inPlayRows ?? [];
          }
        }

        const uniqueMarkets = [
          ...new Map(
            [...(visibleMarkets ?? []), ...inPlayMarkets]
              .filter((row) => row.polymarket_id)
              .map((row) => [row.polymarket_id, row])
          ).values(),
        ];

        totalCount = uniqueMarkets.length;
        await updateRun(buildFetchedProgressUpdate(uniqueMarkets.length, 0));

        for (const marketRow of uniqueMarkets) {
          try {
            const gm = await fetchGammaMarketDetails(marketRow.polymarket_id);
            if (!gm) {
              stats.errors.push(
                `Hot-set market details unavailable for ${marketRow.polymarket_id}`
              );
            } else if (gm.resolved) {
              await processResolvedMarket(supabase, gm, autoShowAll, runId, stats);
            } else {
              await upsertMarket(supabase, gm, 'open', autoShowAll, runId, stats);
            }
          } catch (e: unknown) {
            stats.errors.push(
              `Hot-set sync failed for ${marketRow.polymarket_id}: ${e instanceof Error ? e.message : String(e)}`
            );
          }

          processedCount++;
          await updateRun({
            ...buildIncrementedProgressUpdate({
              processedCount,
              activeCount: totalCount,
              totalCount,
            }),
            markets_synced: stats.markets_synced,
            outcomes_updated: stats.outcomes_updated,
            markets_settled: stats.markets_settled,
            errors: stats.errors,
            error_message: stats.errors[0] ?? null,
          });
        }

        await archiveResolvedMarkets(supabase, archiveAfterHours, stats);
        await updateRun(buildCompletedProgressUpdate({ processedCount, totalCount, stats }));
        return;
      }

      // ── mode: active_page — sync one page of active markets at cursor ────────
      if (mode === 'active_page') {
        const { data: offsetRow } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'active_sync_offset')
          .maybeSingle();

        const currentOffset = parseInt(String(offsetRow?.value ?? '0'), 10) || 0;

        await updateRun({ phase: 'fetching_active' });

        const activeMarkets = await fetchGammaMarkets(
          ACTIVE_MARKETS_URL,
          1,
          currentOffset,
          ({ fetchedCount }) =>
            updateRun({
              phase: 'fetching_active',
              progress_current: fetchedCount,
              progress_total: 0,
            }),
          ({ fetchedCount }) =>
            updateRun({
              phase: 'fetching_active',
              progress_current: fetchedCount,
              progress_total: 0,
            })
        ).catch((e: unknown) => {
          stats.errors.push(
            `Failed to fetch active markets: ${e instanceof Error ? e.message : String(e)}`
          );
          return [] as GammaMarket[];
        });

        totalCount = activeMarkets.length;
        await updateRun(buildFetchedProgressUpdate(activeMarkets.length, 0));

        for (const gm of activeMarkets) {
          try {
            await upsertMarket(supabase, gm, 'open', autoShowAll, runId, stats);
          } catch (e: unknown) {
            stats.errors.push(
              `Error upserting active market ${gm.conditionId}: ${e instanceof Error ? e.message : String(e)}`
            );
          }
          processedCount++;
          await updateRun({
            ...buildIncrementedProgressUpdate({
              processedCount,
              activeCount: activeMarkets.length,
              totalCount,
            }),
            markets_synced: stats.markets_synced,
            outcomes_updated: stats.outcomes_updated,
            markets_settled: stats.markets_settled,
            errors: stats.errors,
            error_message: stats.errors[0] ?? null,
          });
        }

        // Advance cursor, or reset to 0 when the last page (< limit) was reached
        const pageLimit = parseInt(
          new URL(ACTIVE_MARKETS_URL).searchParams.get('limit') ?? '100',
          10
        );
        const nextOffset = activeMarkets.length < pageLimit ? 0 : currentOffset + pageLimit;

        await supabase
          .from('system_settings')
          .update({ value: String(nextOffset) })
          .eq('key', 'active_sync_offset');

        await archiveResolvedMarkets(supabase, archiveAfterHours, stats);
        await updateRun(buildCompletedProgressUpdate({ processedCount, totalCount, stats }));
        return;
      }

      // ── mode: full (default) — fetch all active + resolved markets ───────────
      await updateRun({ phase: 'fetching_active' });

      const activeMarkets = await fetchGammaMarkets(
        ACTIVE_MARKETS_URL,
        maxPages,
        0,
        ({ fetchedCount }) =>
          updateRun({
            phase: 'fetching_active',
            progress_current: fetchedCount,
            progress_total: 0,
          }),
        ({ fetchedCount }) =>
          updateRun({
            phase: 'fetching_active',
            progress_current: fetchedCount,
            progress_total: 0,
          })
      ).catch((e: unknown) => {
        stats.errors.push(
          `Failed to fetch active markets: ${e instanceof Error ? e.message : String(e)}`
        );
        return [] as GammaMarket[];
      });

      await updateRun({ phase: 'fetching_resolved' });

      const resolvedMarkets = await fetchGammaMarkets(
        RESOLVED_MARKETS_URL,
        maxPages,
        0,
        ({ fetchedCount }) =>
          updateRun({
            phase: 'fetching_resolved',
            progress_current: activeMarkets.length + fetchedCount,
            progress_total: 0,
          }),
        ({ fetchedCount }) =>
          updateRun({
            phase: 'fetching_resolved',
            progress_current: activeMarkets.length + fetchedCount,
            progress_total: 0,
          })
      ).catch((e: unknown) => {
        stats.errors.push(
          `Failed to fetch resolved markets: ${e instanceof Error ? e.message : String(e)}`
        );
        return [] as GammaMarket[];
      });

      totalCount = activeMarkets.length + resolvedMarkets.length;

      await updateRun(buildFetchedProgressUpdate(activeMarkets.length, resolvedMarkets.length));

      // ── 3. Upsert active markets ────────────────────────────────────────────
      for (const gm of activeMarkets) {
        try {
          await upsertMarket(supabase, gm, 'open', autoShowAll, runId, stats);
        } catch (e: unknown) {
          stats.errors.push(
            `Error upserting active market ${gm.conditionId}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
        processedCount++;
        await updateRun({
          ...buildIncrementedProgressUpdate({
            processedCount,
            activeCount: activeMarkets.length,
            totalCount,
          }),
          markets_synced: stats.markets_synced,
          outcomes_updated: stats.outcomes_updated,
          markets_settled: stats.markets_settled,
          errors: stats.errors,
          error_message: stats.errors[0] ?? null,
        });
      }

      // ── 4. Process resolved markets ─────────────────────────────────────────
      if (activeMarkets.length === 0) {
        await updateRun(
          buildIncrementedProgressUpdate({
            processedCount,
            activeCount: activeMarkets.length,
            totalCount,
          })
        );
      }

      for (const gm of resolvedMarkets) {
        try {
          await processResolvedMarket(supabase, gm, autoShowAll, runId, stats);
        } catch (e: unknown) {
          stats.errors.push(
            `Error processing resolved market ${gm.conditionId}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
        processedCount++;
        await updateRun({
          ...buildIncrementedProgressUpdate({
            processedCount,
            activeCount: activeMarkets.length,
            totalCount,
          }),
          markets_synced: stats.markets_synced,
          outcomes_updated: stats.outcomes_updated,
          markets_settled: stats.markets_settled,
          errors: stats.errors,
          error_message: stats.errors[0] ?? null,
        });
      }

      await archiveResolvedMarkets(supabase, archiveAfterHours, stats);
      await updateRun(
        buildCompletedProgressUpdate({
          processedCount,
          totalCount,
          stats,
        })
      );
    } catch (e: unknown) {
      const errorMessage = `Unexpected sync error: ${e instanceof Error ? e.message : String(e)}`;
      const failedStats = {
        ...stats,
        errors: [...stats.errors, errorMessage],
      };
      await updateRun(buildFailedProgressUpdate(errorMessage, failedStats));
    }
  };

  const backgroundTask = runSync();
  const edgeRuntime = (
    globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    }
  ).EdgeRuntime;

  edgeRuntime?.waitUntil?.(backgroundTask);

  return jsonWithCors(
    {
      success: true,
      accepted: true,
      run_id: runId,
    },
    202
  );
});

async function archiveResolvedMarkets(
  supabase: ReturnType<typeof createClient>,
  archiveAfterHours: number,
  stats: { errors: string[] }
) {
  const cutoffIso = buildArchiveCutoffIso({ archiveAfterHours });

  const { error } = await supabase
    .from('markets')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('status', 'resolved')
    .lt('resolved_at', cutoffIso);

  if (error) {
    stats.errors.push(`Failed to archive resolved markets: ${error.message}`);
  }
}

async function insertMarketDataDeltas(
  supabase: ReturnType<typeof createClient>,
  deltas: MarketDataDeltaInsert[],
  stats: { errors: string[] }
) {
  if (deltas.length === 0) return;
  const { error } = await supabase.from('market_data_deltas').insert(deltas);
  if (error) {
    stats.errors.push(`Failed to insert market data deltas: ${error.message}`);
  }
}

// ─── upsertMarket ─────────────────────────────────────────────────────────────

async function upsertMarket(
  supabase: ReturnType<typeof createClient>,
  gm: GammaMarket,
  status: 'open' | 'closed',
  autoShowAll: boolean,
  runId: string,
  stats: { markets_synced: number; outcomes_updated: number; errors: string[] }
): Promise<void> {
  const changedAt = new Date().toISOString();
  const { data: existing } = await supabase
    .from('markets')
    .select('id, is_visible, status')
    .eq('polymarket_id', gm.conditionId)
    .maybeSingle();

  const marketStatus: 'open' | 'closed' = gm.closed && !gm.resolved ? 'closed' : status;

  const marketRow = {
    polymarket_id: gm.conditionId,
    question: gm.question,
    status: marketStatus,
    close_at: gm.endDate ?? null,
    liquidity: parseFloat(String(gm.liquidity)) || 0,
    volume: parseFloat(String(gm.volume)) || 0,
    image_url: gm.image ?? null,
    category: gm.category?.trim() || null,
    polymarket_slug: gm.slug ?? null,
    polymarket_status_raw: buildPolymarketStatusRaw(gm),
    last_synced_at: changedAt,
    source_updated_at: gm.updatedAt ?? null,
    finalized_at: gm.resolved ? (gm.resolutionDate ?? changedAt) : null,
    ...(existing === null ? { is_visible: autoShowAll } : {}),
  };

  const { error: upsertErr } = await supabase
    .from('markets')
    .upsert(marketRow, { onConflict: 'polymarket_id' });

  if (upsertErr) throw new Error(`markets upsert: ${upsertErr.message}`);
  stats.markets_synced++;

  const marketId: string = existing?.id ?? (await resolveMarketId(supabase, gm.conditionId));
  const deltas: MarketDataDeltaInsert[] = [];

  if (existing === null) {
    deltas.push(
      buildMarketCreatedDelta({
        marketId,
        polymarketId: gm.conditionId,
        runId,
        changedAt,
        payload: {
          status: marketStatus,
          question: gm.question,
          close_at: gm.endDate ?? null,
        },
      })
    );
  }

  const statusDelta = buildMarketStatusDelta({
    marketId,
    polymarketId: gm.conditionId,
    previousStatus: existing?.status ?? null,
    nextStatus: marketStatus,
    runId,
    changedAt,
  });

  if (statusDelta) {
    deltas.push(statusDelta);
  }

  const outcomeDeltas = await upsertOutcomes(supabase, marketId, gm, runId, stats);
  deltas.push(...outcomeDeltas);
  await insertMarketDataDeltas(supabase, deltas, stats);
}

/** Fetch the internal UUID for a market by polymarket_id. */
async function resolveMarketId(
  supabase: ReturnType<typeof createClient>,
  polymarketId: string
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
  runId: string,
  stats: { outcomes_updated: number; errors: string[] }
): Promise<MarketDataDeltaInsert[]> {
  const changedAt = new Date().toISOString();
  const names = parseJsonField<string[]>(gm.outcomes, []);
  const prices = parseJsonField<string[]>(gm.outcomePrices, []);
  const tokenIds = parseJsonField<string[]>(gm.clobTokenIds, []);

  if (names.length === 0) {
    stats.errors.push(`No outcomes for market ${gm.conditionId}`);
    return [];
  }

  const { data: existingOutcomes, error: existingErr } = await supabase
    .from('market_outcomes')
    .select('polymarket_token_id, price')
    .eq('market_id', marketId);

  if (existingErr) {
    stats.errors.push(
      `Failed to load existing outcomes for ${gm.conditionId}: ${existingErr.message}`
    );
  }

  const rows = names
    .map((name, i) => {
      const price = parseFloat(prices[i] ?? '0');
      const odds = priceToOdds(price > 0 ? price : 0.5);
      return {
        market_id: marketId,
        polymarket_token_id: tokenIds[i] ?? null,
        name,
        price: price > 0 ? price : 0.5,
        odds,
        effective_odds: odds,
        updated_at: changedAt,
      };
    })
    .filter((r) => r.polymarket_token_id !== null);

  if (rows.length === 0) return [];

  const { error } = await supabase.from('market_outcomes').upsert(rows, {
    onConflict: 'market_id,polymarket_token_id',
  });

  if (error) throw new Error(`market_outcomes upsert: ${error.message}`);
  stats.outcomes_updated += rows.length;

  const existingByToken = new Map<string, number | null>(
    (existingOutcomes ?? [])
      .filter((row) => row.polymarket_token_id)
      .map((row) => [row.polymarket_token_id as string, row.price as number | null])
  );

  return buildOutcomePriceDeltas({
    marketId,
    polymarketId: gm.conditionId,
    runId,
    changedAt,
    existingByToken,
    nextOutcomes: rows.map((row) => ({
      tokenId: row.polymarket_token_id as string,
      price: row.price as number,
    })),
  });
}

// ─── processResolvedMarket ────────────────────────────────────────────────────

async function processResolvedMarket(
  supabase: ReturnType<typeof createClient>,
  gm: GammaMarket,
  autoShowAll: boolean,
  runId: string,
  stats: {
    markets_synced: number;
    outcomes_updated: number;
    markets_settled: number;
    errors: string[];
  }
): Promise<void> {
  const changedAt = new Date().toISOString();
  const { data: existing } = await supabase
    .from('markets')
    .select('id, status, is_visible, winning_outcome_id')
    .eq('polymarket_id', gm.conditionId)
    .maybeSingle();

  if (existing?.status === 'resolved') return;

  const marketRow = {
    polymarket_id: gm.conditionId,
    question: gm.question,
    status: 'closed' as const,
    close_at: gm.endDate ?? null,
    liquidity: parseFloat(String(gm.liquidity)) || 0,
    volume: parseFloat(String(gm.volume)) || 0,
    image_url: gm.image ?? null,
    category: gm.category?.trim() || null,
    polymarket_slug: gm.slug ?? null,
    polymarket_status_raw: buildPolymarketStatusRaw(gm),
    last_synced_at: changedAt,
    source_updated_at: gm.updatedAt ?? null,
    finalized_at: gm.resolutionDate ?? changedAt,
    ...(existing === null ? { is_visible: autoShowAll } : {}),
  };

  const { error: upsertErr } = await supabase
    .from('markets')
    .upsert(marketRow, { onConflict: 'polymarket_id' });

  if (upsertErr) throw new Error(`markets upsert (resolved): ${upsertErr.message}`);
  stats.markets_synced++;

  const marketId: string = existing?.id ?? (await resolveMarketId(supabase, gm.conditionId));
  const deltas: MarketDataDeltaInsert[] = [];
  if (existing === null) {
    deltas.push(
      buildMarketCreatedDelta({
        marketId,
        polymarketId: gm.conditionId,
        runId,
        changedAt,
        payload: {
          status: 'closed',
          question: gm.question,
          close_at: gm.endDate ?? null,
        },
      })
    );
  }

  const statusDelta = buildMarketStatusDelta({
    marketId,
    polymarketId: gm.conditionId,
    previousStatus: existing?.status ?? null,
    nextStatus: 'closed',
    runId,
    changedAt,
  });

  if (statusDelta) {
    deltas.push(statusDelta);
  }

  const outcomeDeltas = await upsertOutcomes(supabase, marketId, gm, runId, stats);
  deltas.push(...outcomeDeltas);
  await insertMarketDataDeltas(supabase, deltas, stats);

  const winnerTokenId = await resolveWinnerTokenId({
    market: gm,
    fetchMarketDetails: () => fetchGammaMarketDetails(gm.conditionId),
  });

  if (!winnerTokenId) {
    stats.errors.push(
      `Resolved market ${gm.conditionId}: winner not available in Polymarket resolution data`
    );
    return;
  }

  const { data: winnerOutcome, error: outcomeErr } = await supabase
    .from('market_outcomes')
    .select('id')
    .eq('market_id', marketId)
    .eq('polymarket_token_id', winnerTokenId)
    .maybeSingle();

  if (outcomeErr || !winnerOutcome) {
    stats.errors.push(
      `Cannot find winner outcome for market ${gm.conditionId} (token ${winnerTokenId})`
    );
    return;
  }

  const { data: settlementResult, error: settleErr } = await supabase.rpc('settle_market', {
    p_market_id: marketId,
    p_winning_outcome_id: winnerOutcome.id,
  });

  if (settleErr) throw new Error(`settle_market RPC failed: ${settleErr.message}`);

  await insertMarketDataDeltas(
    supabase,
    [
      buildMarketResolvedDelta({
        marketId,
        polymarketId: gm.conditionId,
        runId,
        changedAt,
        previousWinningOutcomeId: existing?.winning_outcome_id ?? null,
        winningOutcomeId: winnerOutcome.id,
      }),
    ],
    stats
  );

  console.log(`Settled market ${gm.conditionId}:`, settlementResult);
  stats.markets_settled++;
}
