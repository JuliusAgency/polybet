-- Add the "World Cup" category to the curated feed whitelist.
--
-- The frontend renders the horizontal chip row from
-- system_settings.allowed_category_tags via useAllowedCategoryTags(). This must
-- stay in sync with services/market-tracker/src/config.ts CATEGORY_WHITELIST,
-- where 'world-cup' was added with the same slug/label/mode (Polymarket Gamma
-- tag slug = 'world-cup', tag id 519, mode = 'tag').
--
-- World Cup is slotted right after Trending so the gold signature chip renders
-- second in the row (mirrors Polymarket's nav). The market-tracker crawl visits
-- 'world-cup' before 'sports', so World Cup events get 'world-cup' as their
-- primary tag; events already ingested under 'sports' gain 'world-cup' in their
-- tag_slugs array on the next crawl via the order-preserving union in
-- bulk_upsert_events (migration 065) — no backfill needed here.

UPDATE system_settings
   SET value = '[
     {"slug":"trending",  "label":"Trending",  "mode":"featured"},
     {"slug":"world-cup", "label":"World Cup", "mode":"tag"},
     {"slug":"politics",  "label":"Politics",  "mode":"tag"},
     {"slug":"world",     "label":"World",     "mode":"tag"},
     {"slug":"sports",    "label":"Sports",    "mode":"tag"},
     {"slug":"trump",     "label":"Trump",     "mode":"tag"},
     {"slug":"elections", "label":"Elections", "mode":"tag"},
     {"slug":"crypto",    "label":"Crypto",    "mode":"tag"},
     {"slug":"tech",      "label":"Tech",      "mode":"tag"},
     {"slug":"finance",   "label":"Finance",   "mode":"tag"},
     {"slug":"culture",   "label":"Culture",   "mode":"tag"},
     {"slug":"economy",   "label":"Economy",   "mode":"tag"}
   ]'::jsonb
 WHERE key = 'allowed_category_tags';
