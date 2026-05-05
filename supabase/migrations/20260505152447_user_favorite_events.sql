-- Migration 075: per-user favorite events
--
-- Splits the "save" semantics from market-level (059) to event-level when
-- the saved entity is an event aggregate. Standalone markets (event_id IS NULL)
-- still live in user_favorite_markets. Events get their own table so the Saved
-- page can render the event card as a single entity instead of expanding all
-- of the event's child markets.
--
-- Mirrors 059 in shape: composite primary key, RLS, user-scoped policies,
-- index on (user_id, created_at DESC).

CREATE TABLE IF NOT EXISTS user_favorite_events (
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id    uuid        NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorite_events_user_created
  ON user_favorite_events (user_id, created_at DESC);

ALTER TABLE user_favorite_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own favorite events" ON user_favorite_events;
CREATE POLICY "Users read own favorite events" ON user_favorite_events FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users add own favorite events" ON user_favorite_events;
CREATE POLICY "Users add own favorite events" ON user_favorite_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users remove own favorite events" ON user_favorite_events;
CREATE POLICY "Users remove own favorite events" ON user_favorite_events FOR DELETE
  USING (user_id = auth.uid());

-- Backfill: any rows in user_favorite_markets that point to a market with a
-- parent event were created by the previous "save event = bulk save all child
-- markets" flow. Promote them to event-level favorites and drop the originals
-- so the new model has a single source of truth.
--
-- Idempotent: ON CONFLICT DO NOTHING handles re-runs and the DELETE only
-- targets rows that satisfy the same predicate as the INSERT.
INSERT INTO user_favorite_events (user_id, event_id, created_at)
SELECT DISTINCT ON (ufm.user_id, m.event_id)
       ufm.user_id, m.event_id, ufm.created_at
FROM user_favorite_markets ufm
JOIN markets m ON m.id = ufm.market_id
WHERE m.event_id IS NOT NULL
ORDER BY ufm.user_id, m.event_id, ufm.created_at ASC
ON CONFLICT (user_id, event_id) DO NOTHING;

DELETE FROM user_favorite_markets ufm
USING markets m
WHERE m.id = ufm.market_id
  AND m.event_id IS NOT NULL;
