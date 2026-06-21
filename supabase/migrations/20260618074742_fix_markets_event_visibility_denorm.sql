-- Fix: markets feed statement-timeout (Postgres 57014) on the Trending feed.
--
-- Root cause (confirmed on prod via EXPLAIN):
--   The SELECT RLS policy "Authenticated users read visible markets"
--   (migration 20260508091612) appends a correlated
--     EXISTS (SELECT 1 FROM events e WHERE e.id = markets.event_id AND e.is_visible)
--   to every markets read. The Trending feed walks
--     idx_markets_trending_sort_volume_visible (WHERE is_visible)
--   in popularity order, but a large block of *visible* markets whose parent
--   event is hidden/missing (the policy's own comment cites ~54K such rows;
--   World Cup children are a prime example) sit near the top and are rejected by
--   that EXISTS. The scan heap-visits and rejects them one by one until it
--   collects 50 servable rows. The planner underestimates the walk depth, so the
--   index-scan cost balloons (31k -> 633k with RLS) and the query exceeds
--   statement_timeout. Every failing request holds a pooled connection for the
--   full timeout (x2 via the client's retry), saturating the pool -- which is
--   why login also became slow.
--
-- Fix (same denormalization pattern as sort_volume / tag_slugs / trending_rank,
-- migrations 057 / 069 / 075): carry the parent event's visibility on the market
-- row as `event_is_visible`, maintained by triggers. Then:
--   * the RLS policy checks a LOCAL boolean instead of a per-row events subquery
--     (no more nested loop through events on the hot path), and
--   * partial feed indexes scoped to `is_visible AND event_is_visible` contain
--     ONLY servable rows, so the feed walk never visits hidden-parent markets.
-- Semantics are preserved exactly: standalone markets (event_id IS NULL) and
-- markets under a visible event are servable; hidden-/missing-parent markets are
-- not. The separate super-admin policy is untouched (admins still see all).

-- ---------------------------------------------------------------------------
-- 1. Denormalized column. Constant DEFAULT true => instant add (no rewrite).
-- ---------------------------------------------------------------------------
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS event_is_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN markets.event_is_visible IS
  'Denormalized: true when this market is servable w.r.t. its parent event '
  '(event_id IS NULL, or the parent event is is_visible=true). Maintained by '
  'trg_markets_set_event_is_visible (BEFORE INSERT/UPDATE OF event_id) and '
  'trg_events_propagate_is_visible (AFTER UPDATE OF is_visible ON events). '
  'Do not write directly from app code -- let the triggers maintain it. '
  'Mirrors the markets RLS visible-event rule (migration 20260508091612).';

-- ---------------------------------------------------------------------------
-- 2. Backfill. Default already covers the servable case (true); flip only the
--    stranded rows (hidden or missing parent) to false. Anti-join via
--    idx_events_id_visible -- touches just the stranded subset, minimal bloat.
-- ---------------------------------------------------------------------------
UPDATE markets m
   SET event_is_visible = false
 WHERE m.event_id IS NOT NULL
   AND m.event_is_visible = true
   AND NOT EXISTS (
     SELECT 1 FROM events e WHERE e.id = m.event_id AND e.is_visible = true
   );

-- ---------------------------------------------------------------------------
-- 3. BEFORE INSERT/UPDATE OF event_id on markets -- derive from parent event.
--    Early-exit on unchanged event_id (bulk_upsert_markets rewrites event_id
--    every cycle) -- same pattern as markets_set_trending_fields (migration 075).
--    Parent-visibility changes flow through the events trigger in step 4.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION markets_set_event_is_visible()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id THEN
    RETURN NEW;
  END IF;

  NEW.event_is_visible := (
    NEW.event_id IS NULL
    OR EXISTS (SELECT 1 FROM events e WHERE e.id = NEW.event_id AND e.is_visible = true)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_markets_set_event_is_visible ON markets;

CREATE TRIGGER trg_markets_set_event_is_visible
BEFORE INSERT OR UPDATE OF event_id ON markets
FOR EACH ROW
EXECUTE FUNCTION markets_set_event_is_visible();

-- ---------------------------------------------------------------------------
-- 4. AFTER UPDATE OF is_visible on events -- propagate to child markets.
--    Mirrors events_propagate_trending_fields (migration 075).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION events_propagate_is_visible()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_visible IS DISTINCT FROM OLD.is_visible THEN
    UPDATE markets
       SET event_is_visible = NEW.is_visible
     WHERE event_id = NEW.id
       AND event_is_visible IS DISTINCT FROM NEW.is_visible;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_propagate_is_visible ON events;

CREATE TRIGGER trg_events_propagate_is_visible
AFTER UPDATE OF is_visible ON events
FOR EACH ROW
EXECUTE FUNCTION events_propagate_is_visible();

-- ---------------------------------------------------------------------------
-- 5. Rewrite the hot-path SELECT RLS policy to use the local column. Same
--    semantics as migration 20260508091612, but no correlated events subquery,
--    so the planner's selectivity estimate is accurate and the partial indexes
--    in step 6 are usable. Super-admin policy (migration 019) is left untouched.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users read visible markets" ON markets;
CREATE POLICY "Authenticated users read visible markets" ON markets FOR SELECT
  USING (
    is_visible = true
    AND (SELECT auth.uid()) IS NOT NULL
    AND event_is_visible = true
  );

-- ---------------------------------------------------------------------------
-- 6. Servable-only partial indexes. With the RLS rewrite, every feed query
--    carries `is_visible AND event_is_visible`, so these contain exactly the
--    rows the feed can return -- the walk never touches hidden-parent markets.
--    Mirror the column order of the existing feed indexes they supersede:
--      - idx_markets_trending_sort_volume_visible (migration 20260512090959)
--      - idx_markets_visible_sort_volume          (migration 057)
--    The old `WHERE is_visible`-only versions are kept for now (the super-admin
--    path has no event_is_visible filter); drop them in a follow-up once the
--    new ones are confirmed in the plan.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_markets_trending_servable
  ON markets (trending_rank, sort_volume DESC NULLS LAST, id DESC)
  WHERE is_visible = true AND event_is_visible = true;

CREATE INDEX IF NOT EXISTS idx_markets_servable_sort_volume
  ON markets (sort_volume DESC, created_at DESC, id DESC)
  WHERE is_visible = true AND event_is_visible = true;
