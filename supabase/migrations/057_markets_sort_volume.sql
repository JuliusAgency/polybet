-- Migration 057: markets.sort_volume — denormalized volume used for feed ranking.
--
-- Goal: sort the feed by "hotness" (event volume) so that popular events surface
-- first, matching Polymarket's default order. Feed cursor needs a stable key on
-- markets, but the canonical volume lives on events (events.volume is already a
-- rolled-up sum of child markets — see migration 050). We denormalize
-- COALESCE(event.volume, market.volume, 0) onto markets for an O(1) read path.
--
-- Rules:
--   * Markets belonging to an event inherit the event's total volume, so all
--     sibling markets share the same rank and cluster together in the feed.
--   * Standalone markets (no event_id) fall back to their own volume.
--   * No nulls — default 0 — keeps cursor pagination simple (no NULLS LAST edge).
--
-- Kept fresh via:
--   * BEFORE INSERT/UPDATE trigger on markets (volume, event_id changes).
--   * AFTER UPDATE trigger on events (propagate events.volume → all children).

-- 1. Column + index for feed ordering
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS sort_volume numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_markets_visible_sort_volume
  ON markets (sort_volume DESC, created_at DESC, id DESC)
  WHERE is_visible = true;

-- 2. Helper: compute sort_volume for a market row shape
CREATE OR REPLACE FUNCTION compute_market_sort_volume(
  p_event_id uuid,
  p_market_volume numeric
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT e.volume FROM events e WHERE e.id = p_event_id),
    p_market_volume,
    0
  );
$$;

-- 3. Trigger on markets: recompute sort_volume when volume or event_id changes
CREATE OR REPLACE FUNCTION markets_set_sort_volume()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.sort_volume := compute_market_sort_volume(NEW.event_id, NEW.volume);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_markets_set_sort_volume ON markets;

CREATE TRIGGER trg_markets_set_sort_volume
BEFORE INSERT OR UPDATE OF volume, event_id ON markets
FOR EACH ROW
EXECUTE FUNCTION markets_set_sort_volume();

-- 4. Trigger on events: propagate volume changes to all child markets
CREATE OR REPLACE FUNCTION events_propagate_sort_volume()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.volume IS DISTINCT FROM OLD.volume THEN
    UPDATE markets
    SET sort_volume = COALESCE(NEW.volume, volume, 0)
    WHERE event_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_propagate_sort_volume ON events;

CREATE TRIGGER trg_events_propagate_sort_volume
AFTER UPDATE OF volume ON events
FOR EACH ROW
EXECUTE FUNCTION events_propagate_sort_volume();

-- 5. Backfill existing rows
UPDATE markets m
SET sort_volume = COALESCE(e.volume, m.volume, 0)
FROM (
  SELECT id, volume FROM events
) e
WHERE m.event_id = e.id;

UPDATE markets
SET sort_volume = COALESCE(volume, 0)
WHERE event_id IS NULL;
