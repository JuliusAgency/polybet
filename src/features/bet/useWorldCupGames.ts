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
 * Fetch the World Cup "Games" feed: open match events with their moneyline
 * markets (win / draw / loss). Polls on the same cadence as the rest of the
 * markets feed so prices stay fresh without realtime.
 *
 * Only moneyline markets are fetched (`sports_market_type = 'moneyline'`) on a
 * world-cup-tagged market (the denormalized markets.tag_slugs hits the GIN
 * index). Spread/total and non-game World Cup markets (Winner, group winners)
 * are excluded.
 */
export function useWorldCupGames(enabled: boolean) {
  return useQuery<WorldCupGame[]>({
    queryKey: ['world-cup-games'],
    enabled,
    staleTime: MARKETS_REFRESH_INTERVAL_MS,
    refetchInterval: MARKETS_REFRESH_INTERVAL_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select(MARKET_SELECT_FULL)
        .contains('tag_slugs', [WORLD_CUP_TAG_SLUG])
        .eq('sports_market_type', MONEYLINE)
        .eq('status', 'open')
        .order('position', { referencedTable: 'market_outcomes', ascending: true });

      if (error) throw new Error(error.message);
      return groupGames((data ?? []) as unknown as Market[]);
    },
  });
}
