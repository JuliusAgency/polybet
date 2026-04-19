-- Migration 048: Event → Market(s) hierarchy
-- Mirrors Polymarket's structure where a single "event" (e.g. "Iran ceasefire")
-- groups several child markets, each with its own Yes/No (or custom-label) outcomes.
-- Backwards compatible: markets without an event stay as standalone single-market events.

-- ────────────────────────────────────────────────────────────────
-- 1. events table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  polymarket_id   text UNIQUE,
  slug            text,
  title           text NOT NULL,
  description     text,
  category        text,
  image_url       text,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','closed','resolved','archived')),
  close_at        timestamptz,
  resolved_at     timestamptz,
  archived_at     timestamptz,
  is_visible      boolean NOT NULL DEFAULT true,
  last_synced_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_visible_status
  ON events (is_visible, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_polymarket_id
  ON events (polymarket_id);

CREATE INDEX IF NOT EXISTS idx_events_status
  ON events (status);

-- ────────────────────────────────────────────────────────────────
-- 2. markets ← events relationship + per-market label
-- ────────────────────────────────────────────────────────────────
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS event_id    uuid REFERENCES events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_label text;

CREATE INDEX IF NOT EXISTS idx_markets_event_id ON markets (event_id);

-- Composite index for event-aware feed queries
CREATE INDEX IF NOT EXISTS idx_markets_event_visible_status
  ON markets (event_id, is_visible, status)
  WHERE event_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- 3. RLS — mirror markets policy set
-- ────────────────────────────────────────────────────────────────
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read visible events" ON events;
CREATE POLICY "Authenticated users read visible events" ON events FOR SELECT
  USING (is_visible = true AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Super admin reads all events" ON events;
CREATE POLICY "Super admin reads all events" ON events FOR SELECT
  USING (is_super_admin());

-- Writes happen via the market-tracker service (service role) or super_admin RPCs.
DROP POLICY IF EXISTS "Super admin writes events" ON events;
CREATE POLICY "Super admin writes events" ON events FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ────────────────────────────────────────────────────────────────
-- 4. Realtime
-- ────────────────────────────────────────────────────────────────
-- Guarded add: publication membership can only be added once.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE events';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 5. Comments
-- ────────────────────────────────────────────────────────────────
COMMENT ON TABLE events IS
  'Polymarket-style event grouping. An event may contain 1..N markets. '
  'Markets with event_id=NULL are standalone (rendered as single-market cards).';

COMMENT ON COLUMN markets.event_id IS
  'Parent event. NULL means the market is standalone.';

COMMENT ON COLUMN markets.group_label IS
  'Short label of the market inside its event (e.g. "by Apr 22", "Up", "Down"). '
  'Sourced from Polymarket Gamma "groupItemTitle". NULL when the market is standalone.';
