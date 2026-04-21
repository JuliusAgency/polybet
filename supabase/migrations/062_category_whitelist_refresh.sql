-- Migration 062: refresh system_settings.allowed_category_tags to match the
-- new market-tracker whitelist (config.ts CATEGORY_WHITELIST).
--
-- Changes vs migration 053:
--  - drop  : geopolitics, mentions, weather (no longer top-level on Polymarket)
--  - add   : world, trump, elections (trump added, elections promoted)
--  - order : reshuffled to mirror Polymarket's nav — trending first, then
--            the 10 top-level categories ordered by typical volume.
--
-- The frontend reads this value via useAllowedCategoryTags() to render the
-- horizontal chip row on MarketsFeedPage. Keeping it in sync with the tracker
-- whitelist is required — a slug here that the tracker never assigns would
-- render an empty tab; a slug the tracker assigns but that's missing here
-- would hide a populated category from users.

UPDATE system_settings
   SET value = '[
     {"slug":"trending",  "label":"Trending",  "mode":"featured"},
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
