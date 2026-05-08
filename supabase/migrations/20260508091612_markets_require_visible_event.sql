-- Migration: require parent event to be visible for child markets.
--
-- Background: RLS on markets (migration 047) checked only markets.is_visible
-- and ignored parent event visibility. With ~54K markets where parent is
-- hidden, those leaked into the feed as standalone tiles whose click landed
-- on /events/<id> and 404'd via the events RLS policy
-- ("Will Senegal win 2026 FIFA World Cup?", etc — children of the hidden
-- FIFA WC event).
--
-- Fix: extend the markets SELECT policy with an EXISTS subquery that requires
-- the parent event to be visible. Standalone markets (event_id IS NULL)
-- bypass the check via short-circuit. Super-admin policy is untouched
-- (admins continue to see hidden-parent markets).

DROP POLICY IF EXISTS "Authenticated users read visible markets" ON markets;
CREATE POLICY "Authenticated users read visible markets" ON markets FOR SELECT
  USING (
    is_visible = true
    AND (SELECT auth.uid()) IS NOT NULL
    AND (
      event_id IS NULL
      OR EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = markets.event_id AND e.is_visible = true
      )
    )
  );

-- Partial PK-shaped index supports the EXISTS subquery's index-only scan.
CREATE INDEX IF NOT EXISTS idx_events_id_visible
  ON events (id) WHERE is_visible = true;
