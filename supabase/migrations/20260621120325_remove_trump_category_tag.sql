-- Remove "Trump" from the top-level category whitelist.
--
-- Trump is dropped as a top-level category and now lives only as a sub-tag
-- under Politics (and in the "All" related-tags bar) — matching Polymarket.
-- Trump events are still ingested under 'politics' and keep 'trump' in their
-- tag_slugs (buildTagSlugs), so the Politics → Trump sub-filter still works.
--
-- Keep in sync with services/market-tracker/src/config.ts CATEGORY_WHITELIST
-- and the frontend FALLBACK_TAGS in src/features/bet/useAllowedCategoryTags.ts,
-- where 'trump' was removed in the same change.

UPDATE system_settings
   SET value = '[
     {"slug":"trending",  "label":"Trending",  "mode":"featured"},
     {"slug":"world-cup", "label":"World Cup", "mode":"tag"},
     {"slug":"politics",  "label":"Politics",  "mode":"tag"},
     {"slug":"world",     "label":"World",     "mode":"tag"},
     {"slug":"sports",    "label":"Sports",    "mode":"tag"},
     {"slug":"elections", "label":"Elections", "mode":"tag"},
     {"slug":"crypto",    "label":"Crypto",    "mode":"tag"},
     {"slug":"tech",      "label":"Tech",      "mode":"tag"},
     {"slug":"finance",   "label":"Finance",   "mode":"tag"},
     {"slug":"culture",   "label":"Culture",   "mode":"tag"},
     {"slug":"economy",   "label":"Economy",   "mode":"tag"}
   ]'::jsonb
 WHERE key = 'allowed_category_tags';
