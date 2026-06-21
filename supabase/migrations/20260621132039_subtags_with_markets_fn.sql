-- subtags_with_markets: given a list of candidate sub-tag slugs, return the
-- subset that actually has at least one visible market in our DB.
--
-- Why: the markets feed sub-tag bar is built from Polymarket's related-tags,
-- whose activeEventsCount counts ALL Polymarket events. After our 200k lifetime
-- volume threshold many of those tags have zero markets ingested here, so the
-- chip would lead to an empty feed. The market-tracker refreshCategorySubtags
-- task calls this to drop such empty sub-tags before writing category_subtags.
--
-- p_category: when non-null/non-empty, require the market to ALSO carry the
--   category slug (tag_slugs @> [category, slug]) — mirrors the per-category
--   feed filter. When null/empty (the Trending/All bar) only the sub-tag is
--   required (tag_slugs @> [slug]).
-- Input order is preserved (WITH ORDINALITY) so the caller keeps Polymarket's
-- rank order.
--
-- Each candidate is an EXISTS probe against idx_markets_tag_slugs_visible (GIN),
-- so this stays cheap even with ~150 candidate slugs. SECURITY INVOKER: the
-- only caller is the market-tracker (service_role, bypasses RLS); execute is
-- revoked from everyone else.

CREATE OR REPLACE FUNCTION subtags_with_markets(p_category text, p_slugs text[])
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(s.slug ORDER BY s.ord), '{}')
  FROM unnest(p_slugs) WITH ORDINALITY AS s(slug, ord)
  WHERE EXISTS (
    SELECT 1
    FROM markets m
    WHERE m.is_visible
      AND m.tag_slugs @> (
        CASE
          WHEN p_category IS NULL OR p_category = '' THEN ARRAY[s.slug]
          ELSE ARRAY[p_category, s.slug]
        END
      )
  );
$$;

REVOKE ALL ON FUNCTION subtags_with_markets(text, text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION subtags_with_markets(text, text[]) TO service_role;
