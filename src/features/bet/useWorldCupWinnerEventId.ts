import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import {
  WORLD_CUP_WINNER_EVENT_ID_SETTING,
  WORLD_CUP_WINNER_EVENT_ID_FALLBACK,
} from '@/shared/config/worldCup';

/**
 * Resolves the "World Cup Winner" event id: the system_settings override when
 * present, else the hardcoded production fallback. Mirrors the
 * useAllowedCategoryTags pattern so the map can be re-pointed without a deploy.
 */
export function useWorldCupWinnerEventId() {
  return useQuery<string>({
    queryKey: ['world-cup-winner-event-id'],
    staleTime: 30 * 60 * 1000, // 30 min — rarely changes
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', WORLD_CUP_WINNER_EVENT_ID_SETTING)
        .maybeSingle();

      if (error || !data?.value) return WORLD_CUP_WINNER_EVENT_ID_FALLBACK;

      const raw = data.value;
      if (typeof raw === 'string' && raw.trim()) return raw.trim();
      // Tolerate a `{ eventId: "<uuid>" }` object shape too.
      if (raw && typeof raw === 'object') {
        const eventId = (raw as { eventId?: unknown }).eventId;
        if (typeof eventId === 'string' && eventId.trim()) return eventId.trim();
      }
      return WORLD_CUP_WINNER_EVENT_ID_FALLBACK;
    },
  });
}
