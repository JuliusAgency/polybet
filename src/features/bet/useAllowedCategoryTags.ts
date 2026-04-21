import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface AllowedCategoryTag {
  slug: string;
  label: string;
  mode?: 'tag' | 'featured';
}

// Fallback whitelist — used when system_settings hasn't been seeded yet
// (e.g. local DB running an older snapshot). Mirrors migration 062 and
// services/market-tracker/src/config.ts CATEGORY_WHITELIST.
const FALLBACK_TAGS: AllowedCategoryTag[] = [
  { slug: 'trending', label: 'Trending', mode: 'featured' },
  { slug: 'politics', label: 'Politics', mode: 'tag' },
  { slug: 'world', label: 'World', mode: 'tag' },
  { slug: 'sports', label: 'Sports', mode: 'tag' },
  { slug: 'trump', label: 'Trump', mode: 'tag' },
  { slug: 'elections', label: 'Elections', mode: 'tag' },
  { slug: 'crypto', label: 'Crypto', mode: 'tag' },
  { slug: 'tech', label: 'Tech', mode: 'tag' },
  { slug: 'finance', label: 'Finance', mode: 'tag' },
  { slug: 'culture', label: 'Culture', mode: 'tag' },
  { slug: 'economy', label: 'Economy', mode: 'tag' },
];

/** Reads the curated category whitelist from system_settings. */
export function useAllowedCategoryTags() {
  return useQuery<AllowedCategoryTag[]>({
    queryKey: ['allowed-category-tags'],
    staleTime: 30 * 60 * 1000, // 30 min — whitelist rarely changes
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'allowed_category_tags')
        .maybeSingle();

      if (error || !data?.value) return FALLBACK_TAGS;

      const raw = data.value;
      if (!Array.isArray(raw)) return FALLBACK_TAGS;

      const parsed = raw
        .map((item): AllowedCategoryTag | null => {
          if (!item || typeof item !== 'object') return null;
          const slug = (item as { slug?: unknown }).slug;
          const label = (item as { label?: unknown }).label;
          const mode = (item as { mode?: unknown }).mode;
          if (typeof slug !== 'string' || typeof label !== 'string') return null;
          return {
            slug,
            label,
            mode: mode === 'featured' ? 'featured' : 'tag',
          };
        })
        .filter((t): t is AllowedCategoryTag => t !== null);

      return parsed.length > 0 ? parsed : FALLBACK_TAGS;
    },
  });
}
