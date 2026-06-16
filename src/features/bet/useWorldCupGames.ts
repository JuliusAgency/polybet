import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { MARKET_SELECT_FULL } from '@/shared/api/supabase/selects';
import type { Market } from '@/entities/market';
import type { MarketEvent } from '@/entities/event';
import { MARKETS_REFRESH_INTERVAL_MS } from '@/shared/config/markets';
import { WORLD_CUP_TAG_SLUG } from '@/shared/config/worldCup';

// A "game" is a sports match event (e.g. "France vs. Senegal") with its child
// markets split by sportsMarketType. Mirrors the Polymarket Games tab, where
// each match shows a Moneyline / Spread / Total column.
export interface WorldCupGame {
  event: MarketEvent;
  /** Win/Draw markets (one binary Yes/No market per outcome). */
  moneyline: Market[];
  /** Handicap markets (carry markets.line). Empty for football today. */
  spread: Market[];
  /** Over/Under markets (carry markets.line). Empty for football today. */
  total: Market[];
}

const MONEYLINE = 'moneyline';
const SPREAD = 'spreads';
const TOTAL = 'totals';

/**
 * Group raw game markets into per-event games, ordered by kickoff time.
 * Exported for unit testing (pure, no Supabase).
 */
export function groupGames(markets: Market[]): WorldCupGame[] {
  const byEvent = new Map<string, WorldCupGame>();

  for (const market of markets) {
    const event = market.event;
    if (!event || !market.event_id) continue;

    let game = byEvent.get(market.event_id);
    if (!game) {
      game = { event, moneyline: [], spread: [], total: [] };
      byEvent.set(market.event_id, game);
    }

    switch (market.sports_market_type) {
      case MONEYLINE:
        game.moneyline.push(market);
        break;
      case SPREAD:
        game.spread.push(market);
        break;
      case TOTAL:
        game.total.push(market);
        break;
      default:
        // Unknown sports type — keep it under moneyline so it is still bettable
        // rather than silently dropped.
        game.moneyline.push(market);
    }
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
 * (and, when present, spread/total) markets. Polls on the same cadence as the
 * rest of the markets feed so prices stay fresh without realtime.
 *
 * Game markets are identified by `sports_market_type IS NOT NULL` on a
 * world-cup-tagged market (the denormalized markets.tag_slugs hits the GIN
 * index). Non-game World Cup markets (Winner, group winners) are excluded.
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
        .not('sports_market_type', 'is', null)
        .eq('status', 'open')
        .order('position', { referencedTable: 'market_outcomes', ascending: true });

      if (error) throw new Error(error.message);
      return groupGames((data ?? []) as unknown as Market[]);
    },
  });
}
