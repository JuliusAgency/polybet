import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { EVENT_SELECT, MARKET_SELECT_NO_EVENT } from '@/shared/api/supabase/selects';
import { MARKETS_REFRESH_INTERVAL_MS } from '@/shared/config/markets';
import type { Market } from '@/entities/market';
import type { MarketEvent } from '@/entities/event';

export interface EventWithMarkets {
  event: MarketEvent;
  markets: Market[];
}

export function useEventById(eventId: string | undefined) {
  return useQuery<EventWithMarkets | null, Error>({
    queryKey: ['event', eventId] as const,
    enabled: !!eventId,
    // Re-pull fresh odds from DB on the same cadence as useMarketRefresh so that
    // the bet placement page reflects Polymarket prices without realtime.
    staleTime: MARKETS_REFRESH_INTERVAL_MS,
    refetchInterval: MARKETS_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      if (!eventId) return null;

      const { data: eventRow, error: eventError } = await supabase
        .from('events')
        .select(EVENT_SELECT)
        .eq('id', eventId)
        .maybeSingle();

      if (eventError) throw new Error(eventError.message);
      if (!eventRow) return null;

      const { data: marketRows, error: marketsError } = await supabase
        .from('markets')
        .select(MARKET_SELECT_NO_EVENT)
        .eq('event_id', eventId)
        .eq('is_visible', true)
        .order('created_at', { ascending: true });

      if (marketsError) throw new Error(marketsError.message);

      const markets = (marketRows ?? []).map((row) => ({
        ...(row as unknown as Market),
        event: eventRow as unknown as MarketEvent,
      }));

      return {
        event: eventRow as unknown as MarketEvent,
        markets,
      };
    },
  });
}
