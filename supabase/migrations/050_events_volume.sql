-- Migration 050: events.volume — aggregated from child markets.
-- Polymarket-style event cards surface a rolled-up volume in the header.
-- We store it denormalized on events for O(1) reads in the feed, and keep
-- it fresh via a trigger on markets.volume / markets.event_id changes.

-- 1. Column + index for ordering
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS volume numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_events_volume
  ON events (volume DESC);

-- 2. Recalculation helper
CREATE OR REPLACE FUNCTION recalc_event_volume(p_event_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE events
  SET volume = COALESCE(
    (SELECT SUM(COALESCE(m.volume, 0)) FROM markets m WHERE m.event_id = p_event_id),
    0
  )
  WHERE id = p_event_id;
$$;

-- 3. Trigger: keep events.volume in sync with markets.volume / event_id changes
CREATE OR REPLACE FUNCTION markets_recalc_event_volume()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.event_id IS NOT NULL THEN
      PERFORM recalc_event_volume(NEW.event_id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.event_id IS DISTINCT FROM OLD.event_id THEN
      IF OLD.event_id IS NOT NULL THEN
        PERFORM recalc_event_volume(OLD.event_id);
      END IF;
      IF NEW.event_id IS NOT NULL THEN
        PERFORM recalc_event_volume(NEW.event_id);
      END IF;
    ELSIF NEW.volume IS DISTINCT FROM OLD.volume AND NEW.event_id IS NOT NULL THEN
      PERFORM recalc_event_volume(NEW.event_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.event_id IS NOT NULL THEN
      PERFORM recalc_event_volume(OLD.event_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_markets_recalc_event_volume ON markets;

CREATE TRIGGER trg_markets_recalc_event_volume
AFTER INSERT OR UPDATE OF volume, event_id OR DELETE ON markets
FOR EACH ROW
EXECUTE FUNCTION markets_recalc_event_volume();

-- 4. Backfill: populate volumes for all existing events
UPDATE events e
SET volume = COALESCE(agg.total, 0)
FROM (
  SELECT event_id, SUM(COALESCE(volume, 0)) AS total
  FROM markets
  WHERE event_id IS NOT NULL
  GROUP BY event_id
) agg
WHERE agg.event_id = e.id;
