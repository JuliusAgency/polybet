-- Migration 070: GIN index on the denormalized markets.tag_slugs column.
--
-- Built CONCURRENTLY so the Polymarket sync writers are not blocked while the
-- index builds on ~157k rows. CONCURRENTLY cannot run inside a transaction, so
-- this lives in its own migration. supabase db push runs each migration file
-- in its own transaction; CREATE INDEX CONCURRENTLY tolerates being the only
-- statement because it disables the implicit BEGIN/COMMIT wrapping.
--
-- The partial predicate (`WHERE is_visible = true`) keeps the index small —
-- non-visible markets never appear in the feed.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_markets_tag_slugs_visible
  ON markets USING gin (tag_slugs)
  WHERE is_visible = true;
