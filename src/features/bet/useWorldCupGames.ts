import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { MARKET_SELECT_FULL } from '@/shared/api/supabase/selects';
import type { Market } from '@/entities/market';
import type { MarketEvent } from '@/entities/event';
import { MARKETS_REFRESH_INTERVAL_MS } from '@/shared/config/markets';
import { WORLD_CUP_TAG_SLUG } from '@/shared/config/worldCup';

// A "game" is a sports match event (e.g. "France vs. Senegal") with its
// moneyline markets. Mirrors the Polymarket Games tab, but we only surface the
// 3-way moneyline (win / draw / loss) — spread and total betting are not shown.
export interface WorldCupGame {
  event: MarketEvent;
  /** Win/Draw markets (one binary Yes/No market per outcome). */
  moneyline: Market[];
}

const MONEYLINE = 'moneyline';

// How far back finished games stay visible under "View finished" (3 days).
const FINISHED_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Group raw moneyline markets into per-event games, ordered by kickoff time.
 * Exported for unit testing (pure, no Supabase).
 */
export function groupGames(markets: Market[]): WorldCupGame[] {
  const byEvent = new Map<string, WorldCupGame>();

  for (const market of markets) {
    const event = market.event;
    if (!event || !market.event_id) continue;

    let game = byEvent.get(market.event_id);
    if (!game) {
      game = { event, moneyline: [] };
      byEvent.set(market.event_id, game);
    }

    // Only moneyline is bettable on the Games tab. An unknown sports type is
    // still kept under moneyline rather than silently dropped.
    game.moneyline.push(market);
  }

  return [...byEvent.values()].sort((a, b) => {
    const ta = a.event.game_start_time
      ? Date.parse(a.event.game_start_time)
      : Number.MAX_SAFE_INTEGER;
    const tb = b.event.game_start_time
      ? Date.parse(b.event.game_start_time)
      : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
}

/**
 * Default Games feed: OPEN moneyline match markets (win / draw / loss) — i.e.
 * upcoming + live games, ordered by kickoff. A single query on the denormalized
 * `markets.tag_slugs` (GIN index) filtered to `sports_market_type='moneyline'`
 * and `status='open'`. Spread/total and non-game World Cup markets (Winner,
 * group winners) are excluded.
 */
async function fetchOpenGames(): Promise<WorldCupGame[]> {
  const { data, error } = await supabase
    .from('markets')
    .select(MARKET_SELECT_FULL)
    .contains('tag_slugs', [WORLD_CUP_TAG_SLUG])
    .eq('sports_market_type', MONEYLINE)
    .eq('status', 'open')
    .order('position', { referencedTable: 'market_outcomes', ascending: true });

  if (error) throw new Error(error.message);
  return groupGames((data ?? []) as unknown as Market[]);
}

/**
 * "View finished" feed: upcoming + live + recently-played games (any status),
 * bounded to events whose kickoff is within the last few days (so the closed
 * back-catalogue can't grow unbounded). Two-phase like useWorldCupProps:
 *   1. game events (world-cup tagged, sport set, kickoff >= now-3d) — ids only;
 *   2. all their moneyline markets (any status), outcome-ordered.
 * Phase 1 filters on `events` because the recency bound is on game_start_time,
 * which is not denormalized onto markets.
 */
async function fetchGamesWithFinished(): Promise<WorldCupGame[]> {
  const cutoff = new Date(Date.now() - FINISHED_LOOKBACK_MS).toISOString();

  const { data: eventRows, error: eventError } = await supabase
    .from('events')
    .select('id')
    .contains('tag_slugs', [WORLD_CUP_TAG_SLUG])
    .not('sport', 'is', null)
    .gte('game_start_time', cutoff)
    .order('game_start_time', { ascending: true });
  if (eventError) throw new Error(eventError.message);

  const eventIds = (eventRows ?? []).map((row) => (row as { id: string }).id);
  if (eventIds.length === 0) return [];

  const { data, error } = await supabase
    .from('markets')
    .select(MARKET_SELECT_FULL)
    .in('event_id', eventIds)
    .eq('sports_market_type', MONEYLINE)
    .order('position', { referencedTable: 'market_outcomes', ascending: true });
  if (error) throw new Error(error.message);
  return groupGames((data ?? []) as unknown as Market[]);
}

/**
 * Fetch the World Cup "Games" feed. Polls on the same cadence as the rest of
 * the markets feed so prices stay fresh without realtime.
 *
 * @param showFinished when true, also include recently-played games (any
 *   status) so they can be browsed under "View finished"; default is open
 *   (upcoming + live) games only.
 */
export function useWorldCupGames(enabled: boolean, showFinished = false) {
  return useQuery<WorldCupGame[]>({
    queryKey: ['world-cup-games', showFinished],
    enabled,
    staleTime: MARKETS_REFRESH_INTERVAL_MS,
    refetchInterval: MARKETS_REFRESH_INTERVAL_MS,
    queryFn: () => (showFinished ? fetchGamesWithFinished() : fetchOpenGames()),
  });
}
