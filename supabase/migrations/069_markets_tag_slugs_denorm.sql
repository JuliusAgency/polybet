-- Migration 069: denormalize events.tag_slugs onto markets for fast feed filtering.
--
-- Problem: filtering markets by event tag (e.g. "trending") forced a nested
-- loop join — for every matching event the planner had to fetch its markets
-- and re-sort the union by sort_volume. With ~12k events and ~157k markets,
-- production query latency degraded to 250+ seconds under concurrent sync load
-- and hit statement_timeout (Postgres error 57014).
--
-- Same denormalization pattern as migration 057 (sort_volume): keep a
-- copy of the event's tag_slugs on each market, maintain via triggers, and
-- index it locally so the existing markets-only ordering can be reused.

-- 0. Remove `markets` and `market_outcomes` from the realtime publication.
--    Frontend no longer subscribes to either (useMarkets, useMyBets cleaned up
--    alongside this change), and keeping `markets` in the publication would
--    broadcast every row of the backfill below — burning the realtime quota
--    for nothing. `market_outcomes` is dropped because it was the single
--    biggest source of realtime traffic (Polymarket sync writes hundreds of
--    rows per minute, broadcast to every connected client).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'markets'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE markets;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'market_outcomes'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE market_outcomes;
  END IF;
END $$;

-- 1. Column. Adding NOT NULL with constant default is metadata-only in PG 11+.
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS tag_slugs text[] NOT NULL DEFAULT '{}';

-- 2. Maintain on the market side: when event_id changes, refresh tag_slugs.
CREATE OR REPLACE FUNCTION markets_set_tag_slugs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- bulk_upsert_markets always writes event_id in its SET clause even when the
  -- value is unchanged, which fires this column-list trigger on every upserted
  -- row. Skip the events sub-select when event_id is identical to OLD to avoid
  -- one extra query per market on every Polymarket sync cycle.
  IF TG_OP = 'UPDATE' AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id THEN
    RETURN NEW;
  END IF;

  NEW.tag_slugs := COALESCE(
    (SELECT tag_slugs FROM events WHERE id = NEW.event_id),
    '{}'::text[]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_markets_set_tag_slugs ON markets;

CREATE TRIGGER trg_markets_set_tag_slugs
BEFORE INSERT OR UPDATE OF event_id ON markets
FOR EACH ROW
EXECUTE FUNCTION markets_set_tag_slugs();

-- 3. Maintain on the event side: when an event's tag_slugs changes, propagate.
CREATE OR REPLACE FUNCTION events_propagate_tag_slugs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tag_slugs IS DISTINCT FROM OLD.tag_slugs THEN
    UPDATE markets
    SET tag_slugs = COALESCE(NEW.tag_slugs, '{}'::text[])
    WHERE event_id = NEW.id
      AND tag_slugs IS DISTINCT FROM COALESCE(NEW.tag_slugs, '{}'::text[]);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_propagate_tag_slugs ON events;

CREATE TRIGGER trg_events_propagate_tag_slugs
AFTER UPDATE OF tag_slugs ON events
FOR EACH ROW
EXECUTE FUNCTION events_propagate_tag_slugs();

-- Backfill of existing rows + GIN index live in migration 070, which uses a
-- chunked SKIP LOCKED loop to avoid waiting on rows currently locked by the
-- Polymarket sync writers.
