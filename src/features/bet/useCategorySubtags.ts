import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface CategorySubtag {
  /** Polymarket tag slug — matches an entry in events/markets.tag_slugs, so the
   *  feed can filter with `tag_slugs @> [slug]`. */
  slug: string;
  /** English display label from Polymarket (sub-tags are dynamic and not
   *  translated — see the feature decision in CLAUDE.md). */
  label: string;
}

/** category slug (or the synthetic 'trending') → ordered sub-tag chips. */
export type CategorySubtagsMap = Record<string, CategorySubtag[]>;

/** Synthetic key holding the aggregated sub-tags used by the Trending / All
 *  views. Written by the market-tracker refreshCategorySubtags task. */
export const TRENDING_SUBTAGS_KEY = 'trending';

// Fallback used when system_settings.category_subtags is empty/unseeded — a
// fresh DB before the market-tracker's hourly refresh, or a local stack. Slugs
// are verified against Polymarket's /tags/{id}/related-tags/tags so clicking a
// chip actually filters. The live task overwrites this with current data;
// categories absent here render no sub-tag bar until then.
const FALLBACK_SUBTAGS: CategorySubtagsMap = {
  // Mirrors Polymarket's "All" tag (id 100215) related-tags — the homepage
  // "All markets" sub-bar, in its rank order.
  trending: [
    { slug: 'trump', label: 'Trump' },
    { slug: 'iran', label: 'Iran' },
    { slug: 'uk-labour-leadership', label: 'UK Labour Leadership' },
    { slug: 'peace-deal', label: 'Peace Deal' },
    { slug: 'fed', label: 'Fed' },
    { slug: 'gta-vi', label: 'GTA VI' },
    { slug: 'june-23-primaries', label: 'June 23 Primaries' },
    { slug: 'us-open-golf', label: 'U.S. Open 2026' },
    { slug: 'spacex', label: 'SpaceX' },
    { slug: 'mythos', label: 'Claude Mythos' },
    { slug: 'colombia-election', label: 'Colombia Election' },
    { slug: '2026-summer-transfer-window', label: 'Soccer Transfers' },
    { slug: 'daily-temperature', label: 'Daily Temperature' },
    { slug: 'lebanon', label: 'Lebanon' },
    { slug: 'fifa-world-cup', label: 'FIFA World Cup' },
    { slug: 'strait-of-hormuz', label: 'Strait of Hormuz' },
    { slug: 'openai-ipo', label: 'OpenAI IPO' },
    { slug: 'tweets-markets', label: 'Tweet Markets' },
    { slug: 'oil', label: 'Oil' },
    { slug: 'global-elections', label: 'Global Elections' },
  ],
  politics: [
    { slug: 'trump', label: 'Trump' },
    { slug: 'midterms', label: 'Midterms' },
    { slug: 'global-elections', label: 'Global Elections' },
    { slug: 'primaries', label: 'Primaries' },
    { slug: 'congress', label: 'Congress' },
    { slug: 'trump-cabinet', label: 'Trump Cabinet' },
    { slug: 'courts', label: 'Courts' },
    { slug: 'gov-shutdown', label: 'Gov Shutdown' },
  ],
  world: [
    { slug: 'china', label: 'China' },
    { slug: 'gaza', label: 'Gaza' },
    { slug: 'iran', label: 'Iran' },
    { slug: 'ukraine', label: 'Ukraine' },
    { slug: 'venezuela', label: 'Venezuela' },
    { slug: 'israel', label: 'Israel' },
    { slug: 'india-pakistan', label: 'India-Pakistan' },
    { slug: 'global-elections', label: 'Global Elections' },
  ],
  sports: [
    { slug: 'nfl', label: 'NFL' },
    { slug: 'soccer', label: 'Soccer' },
    { slug: 'epl', label: 'EPL' },
    { slug: 'mlb', label: 'MLB' },
    { slug: 'wnba', label: 'WNBA' },
    { slug: 'golf', label: 'Golf' },
    { slug: 'ufc', label: 'UFC' },
    { slug: 'chess', label: 'Chess' },
  ],
  trump: [
    { slug: 'trade-war', label: 'Trade War' },
    { slug: 'foreign-policy', label: 'Foreign Policy' },
    { slug: 'trump-cabinet', label: 'Trump Cabinet' },
    { slug: 'maga', label: 'MAGA' },
    { slug: 'economic-policy', label: 'Economic Policy' },
    { slug: 'approval', label: 'Approval' },
  ],
  crypto: [
    { slug: 'hit-price', label: 'Hit Price' },
    { slug: 'microstrategy', label: 'MicroStrategy' },
    { slug: 'stablecoins', label: 'Stablecoins' },
    { slug: 'airdrops', label: 'Airdrops' },
  ],
  tech: [
    { slug: 'ai', label: 'AI' },
    { slug: 'elon-musk', label: 'Elon Musk' },
    { slug: 'spacex', label: 'SpaceX' },
    { slug: 'apple', label: 'Apple' },
    { slug: 'ipos', label: 'IPOs' },
    { slug: 'openai', label: 'OpenAI' },
    { slug: 'big-tech', label: 'Big Tech' },
    { slug: 'tiktok', label: 'TikTok' },
  ],
  finance: [
    { slug: 'earnings', label: 'Earnings' },
    { slug: 'acquisitions', label: 'Acquisitions' },
    { slug: 'ipos', label: 'IPOs' },
    { slug: 'fed-rates', label: 'Fed Rates' },
    { slug: 'treasuries', label: 'Treasuries' },
  ],
  culture: [
    { slug: 'art', label: 'Art' },
    { slug: 'music', label: 'Music' },
    { slug: 'celebrities', label: 'Celebrities' },
    { slug: 'awards', label: 'Awards' },
    { slug: 'movies', label: 'Movies' },
    { slug: 'gta-vi', label: 'GTA VI' },
    { slug: 'tweets-markets', label: 'Tweet Markets' },
    { slug: 'youtube', label: 'YouTube' },
  ],
  economy: [
    { slug: 'trade-war', label: 'Trade War' },
    { slug: 'fed-rates', label: 'Fed Rates' },
    { slug: 'inflation', label: 'Inflation' },
    { slug: 'gdp', label: 'GDP' },
    { slug: 'taxes', label: 'Taxes' },
    { slug: 'housing', label: 'Housing' },
  ],
};

/**
 * Reads the per-category sub-tag bar definition from
 * system_settings.category_subtags (written hourly by the market-tracker's
 * refreshCategorySubtags task; readable by everyone via the public RLS policy
 * in migration 20260621102219). Falls back to a bundled set when the key is
 * empty/unseeded so the bar still renders on a fresh DB.
 */
export function useCategorySubtags() {
  return useQuery<CategorySubtagsMap>({
    queryKey: ['category-subtags'],
    staleTime: 30 * 60 * 1000, // 30 min — related tags rotate only a few times/day
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'category_subtags')
        .maybeSingle();

      if (error || !data?.value) return FALLBACK_SUBTAGS;

      const parsed = parseSubtagsMap(data.value);
      return parsed && Object.keys(parsed).length > 0 ? parsed : FALLBACK_SUBTAGS;
    },
  });
}

function parseSubtagsMap(raw: unknown): CategorySubtagsMap | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const out: CategorySubtagsMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const tags = value
      .map((item): CategorySubtag | null => {
        if (!item || typeof item !== 'object') return null;
        const slug = (item as { slug?: unknown }).slug;
        const label = (item as { label?: unknown }).label;
        if (typeof slug !== 'string' || typeof label !== 'string') return null;
        return { slug, label };
      })
      .filter((t): t is CategorySubtag => t !== null);
    if (tags.length > 0) out[key] = tags;
  }
  return out;
}

/**
 * Resolve the sub-tag chips for the active top-level category. Trending / All
 * (the `trending` slug or `null`) use the aggregated set. Returns [] when a
 * category has no sub-tags, which the bar treats as "render nothing".
 */
export function subtagsForCategory(
  map: CategorySubtagsMap,
  categorySlug: string | null
): CategorySubtag[] {
  const key = categorySlug ?? TRENDING_SUBTAGS_KEY;
  return map[key] ?? map[TRENDING_SUBTAGS_KEY] ?? [];
}
