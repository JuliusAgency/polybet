import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { MarketEvent } from './useMarkets';

const SIMILAR_EVENTS_LIMIT = 8;

export interface SimilarEventsInput {
  eventId: string | undefined;
  tagSlug: string | null | undefined;
  category: string | null | undefined;
  enabled?: boolean;
}

export function useSimilarEvents({
  eventId,
  tagSlug,
  category,
  enabled = true,
}: SimilarEventsInput) {
  const hasFilter = Boolean(tagSlug) || Boolean(category);

  return useQuery<MarketEvent[], Error>({
    queryKey: ['similarEvents', eventId, tagSlug ?? null, category ?? null] as const,
    enabled: enabled && !!eventId && hasFilter,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!eventId || !hasFilter) return [];

      const orParts: string[] = [];
      // cs = contains (PostgREST array @> {slug}). Matches any event whose
      // tag_slugs array includes the filter tag, not just the primary one.
      if (tagSlug) orParts.push(`tag_slugs.cs.{${tagSlug}}`);
      if (category) orParts.push(`category.eq.${category}`);

      const { data, error } = await supabase
        .from('events')
        .select(
          'id, title, description, category, image_url, close_at, status, volume, tag_slug, tag_label, tag_slugs'
        )
        .eq('is_visible', true)
        .neq('status', 'resolved')
        .neq('status', 'archived')
        .neq('id', eventId)
        .or(orParts.join(','))
        .order('volume', { ascending: false, nullsFirst: false })
        .limit(SIMILAR_EVENTS_LIMIT);

      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as MarketEvent[];

      // Rank: same tag first, then same category, volume as tie-breaker.
      return rows.slice().sort((a, b) => {
        const aTag = tagSlug && a.tag_slugs?.includes(tagSlug) ? 1 : 0;
        const bTag = tagSlug && b.tag_slugs?.includes(tagSlug) ? 1 : 0;
        if (aTag !== bTag) return bTag - aTag;
        const aCat = category && a.category === category ? 1 : 0;
        const bCat = category && b.category === category ? 1 : 0;
        if (aCat !== bCat) return bCat - aCat;
        return (b.volume ?? 0) - (a.volume ?? 0);
      });
    },
  });
}
