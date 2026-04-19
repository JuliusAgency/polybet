import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { MarketEvent } from './useMarkets';

const SIMILAR_EVENTS_LIMIT = 6;

export function useSimilarEvents(
  category: string | null | undefined,
  excludeEventId: string | undefined,
  enabled: boolean = true
) {
  return useQuery<MarketEvent[], Error>({
    queryKey: ['similarEvents', category, excludeEventId] as const,
    enabled: enabled && !!category && !!excludeEventId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!category || !excludeEventId) return [];
      const { data, error } = await supabase
        .from('events')
        .select('id, title, description, category, image_url, close_at, status, volume')
        .eq('is_visible', true)
        .eq('category', category)
        .neq('status', 'resolved')
        .neq('status', 'archived')
        .neq('id', excludeEventId)
        .order('volume', { ascending: false, nullsFirst: false })
        .limit(SIMILAR_EVENTS_LIMIT);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MarketEvent[];
    },
  });
}
