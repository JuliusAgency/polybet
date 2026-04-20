-- Migration 053: tag columns on events + volume threshold settings.
--
-- Enables the "popular categories" feed filter and documents the lifetime
-- volume threshold (enforced by the tracker + migration 052 cleanup).

-- ────────────────────────────────────────────────────────────────
-- 1. events.tag_slug / tag_label — primary category for the event.
--    Polymarket events can have multiple tags; we pick the first whitelisted
--    one at sync time and denormalize it here for O(1) feed filters.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS tag_slug  text,
  ADD COLUMN IF NOT EXISTS tag_label text;

CREATE INDEX IF NOT EXISTS idx_events_tag_slug
  ON events (tag_slug) WHERE tag_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_tag_volume
  ON events (tag_slug, volume DESC)
  WHERE tag_slug IS NOT NULL AND volume >= 500000;

COMMENT ON COLUMN events.tag_slug IS
  'Primary Polymarket tag slug (from the whitelist). Picked from event.tags[] at sync.';

COMMENT ON COLUMN events.tag_label IS
  'Human-readable label for events.tag_slug (e.g. "Politics", "Crypto").';

-- ────────────────────────────────────────────────────────────────
-- 2. system_settings: threshold + category whitelist.
-- ────────────────────────────────────────────────────────────────
INSERT INTO system_settings (key, value) VALUES
  ('market_volume_threshold_usd', '500000'::jsonb),
  ('allowed_category_tags', '[
    {"slug":"trending",    "label":"Trending",    "mode":"featured"},
    {"slug":"politics",    "label":"Politics",    "mode":"tag"},
    {"slug":"geopolitics", "label":"Geopolitics", "mode":"tag"},
    {"slug":"sports",      "label":"Sports",      "mode":"tag"},
    {"slug":"crypto",      "label":"Crypto",      "mode":"tag"},
    {"slug":"finance",     "label":"Finance",     "mode":"tag"},
    {"slug":"culture",     "label":"Culture",     "mode":"tag"},
    {"slug":"tech",        "label":"Tech",        "mode":"tag"},
    {"slug":"economy",     "label":"Economy",     "mode":"tag"},
    {"slug":"mentions",    "label":"Mentions",    "mode":"tag"},
    {"slug":"weather",     "label":"Weather",     "mode":"tag"},
    {"slug":"elections",   "label":"Elections",   "mode":"tag"}
  ]'::jsonb)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value;

COMMENT ON TABLE system_settings IS
  'Key/value config. Relevant keys for markets sync: '
  'market_volume_threshold_usd (numeric, lifetime volume filter), '
  'allowed_category_tags (array of {slug,label,mode}; mode="featured" maps to /events?featured=true).';
