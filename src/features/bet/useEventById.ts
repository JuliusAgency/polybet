import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { Market, MarketEvent } from './useMarkets';

export interface EventWithMarkets {
  event: MarketEvent;
  markets: Market[];
}

const MARKET_SELECT =
  'id, polymarket_id, question, status, winning_outcome_id, category, image_url, close_at, last_synced_at, created_at, volume, event_id, group_label, market_outcomes!market_outcomes_market_id_fkey(id, name, price, odds, effective_odds, updated_at, polymarket_token_id)';

export function useEventById(eventId: string | undefined) {
  return useQuery<EventWithMarkets | null, Error>({
    queryKey: ['event', eventId] as const,
    enabled: !!eventId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!eventId) return null;

      const { data: eventRow, error: eventError } = await supabase
        .from('events')
        .select('id, title, description, category, image_url, close_at, status, volume')
        .eq('id', eventId)
        .maybeSingle();

      if (eventError) throw new Error(eventError.message);
      if (!eventRow) return null;

      const { data: marketRows, error: marketsError } = await supabase
        .from('markets')
        .select(MARKET_SELECT)
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
