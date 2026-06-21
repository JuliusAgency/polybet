-- Lower the market volume threshold from $500k to $200k.
--
-- `system_settings.market_volume_threshold_usd` (seeded at 500000 by migration
-- 053) is the lifetime-volume floor below which non-World-Cup events/markets are
-- not surfaced. In THIS repo nothing reads it on the hot path — it is the
-- configurable knob consumed by the external market-tracker (separate repo),
-- which decides what to crawl/ingest and set is_visible on. Lowering it here
-- updates the source-of-truth setting; the tracker picks up 200000 on its next
-- run and begins ingesting/showing events in the 200k–500k band (and World Cup
-- stays exempt, as before).
--
-- Note: this changes a policy value only. It does NOT retroactively resurrect
-- events previously hard-deleted by the one-time migration 052 cleanup — those
-- come back when the tracker re-crawls them under the new floor.
--
-- IMPORTANT (out of this repo): if the market-tracker hardcodes its own
-- threshold constant instead of reading this setting, it must be set to 200000
-- there too. The historical one-time cleanup in migration 052 hardcoded 500000
-- but is already applied and non-recurring, so it is intentionally left as-is.

UPDATE system_settings
   SET value = '200000'::jsonb
 WHERE key = 'market_volume_threshold_usd';
