-- Migration 070: backfill markets.tag_slugs and add the GIN index.
--
-- Why split from 069: a bulk UPDATE on ~157k rows hit statement_timeout
-- (Postgres error 57014) under the migration role's default 2-minute cap when
-- combined with concurrent Polymarket sync write contention.
--
-- The migration is intentionally idempotent. On a freshly reset database it
-- does the full backfill; on a database where it has already run it skips
-- every row in the WHERE filter and exits in milliseconds — so re-running it
-- via `supabase db reset` is safe.
--
-- Notes for the Supabase CLI:
--   * `supabase db push` runs each top-level statement in autocommit /
--     pipeline mode. `SET LOCAL` is rejected outside an explicit transaction,
--     so we use plain `SET` — it persists session-wide for the rest of the
--     migration file.
--   * `CREATE INDEX CONCURRENTLY` is rejected by the CLI's pipeline mode
--     (SQLSTATE 25001). We use a plain `CREATE INDEX` instead — on ~157k
--     rows of small text[] arrays the GIN build is only a few seconds and
--     sync writers simply queue on the table lock for that window.

-- Wrap the long UPDATE in an explicit transaction so we can use `SET LOCAL`
-- — that scopes the disabled timeout to this transaction only and cannot
-- leak to subsequent migrations in the same CLI session, even if a later
-- statement aborts.
BEGIN;
SET LOCAL statement_timeout = 0;

-- Single bulk UPDATE. The WHERE filter is the idempotency guard — already-
-- backfilled rows are skipped, so re-running this migration is a no-op.
-- Writing only `tag_slugs` does not fire the existing markets triggers
-- (`markets_set_sort_volume` and `markets_set_tag_slugs` are scoped to the
-- volume/event_id columns), so no recursion or extra trigger work happens.
UPDATE markets m
SET tag_slugs = COALESCE(e.tag_slugs, '{}'::text[])
FROM events e
WHERE m.event_id = e.id
  AND m.tag_slugs IS DISTINCT FROM COALESCE(e.tag_slugs, '{}'::text[]);

COMMIT;

-- GIN index for tag containment lookups, scoped to the visible feed slice.
-- Plain CREATE INDEX (non-CONCURRENT) is fine on ~157k rows of small text[]
-- arrays — build is a few seconds. Runs at default statement_timeout.
CREATE INDEX IF NOT EXISTS idx_markets_tag_slugs_visible
  ON markets USING gin (tag_slugs)
  WHERE is_visible = true;
