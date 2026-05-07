-- Migration 075: real Polymarket Trending order.
--
-- Problem (Bug 5 from QA): the "Trending" tab orders by sort_volume DESC,
-- which does not match Polymarket's own Trending — they curate a featured
-- set and order it by volume24hr. Our event_id->tag_slugs denorm already
-- carries the curated `trending` membership flag (set by the external
-- market-tracker), but the sort key was wrong.
--
-- This migration adds two columns:
--   * trending_rank — position in Polymarket's featured response (1-based,
--                     NULL when the event is not currently featured). Lower
--                     numbers come first, NULLs go last.
--   * volume_24hr   — Polymarket's volume24hr field. Used as a tiebreaker
--                     when trending_rank ties, and as the only sort key for
--                     non-featured fallback below the featured block.
--
-- Both live on `events` canonically; we denormalize onto `markets` (same
-- pattern as sort_volume / tag_slugs in migrations 057 and 069) so the
-- markets feed can sort with a single index walk and avoid the nested-loop
-- timeout we hit in 069.

-- 1. Columns on events.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS trending_rank int NULL,
  ADD COLUMN IF NOT EXISTS volume_24hr   numeric NULL;

COMMENT ON COLUMN events.trending_rank IS
  'Position in Polymarket /events?featured=true response (1-based). NULL when not currently featured. Maintained by sync-polymarket-markets edge function.';
COMMENT ON COLUMN events.volume_24hr IS
  'Polymarket volume24hr field. Maintained by sync-polymarket-markets edge function.';

-- 2. Same columns on markets, denormalized.
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS trending_rank int NULL,
  ADD COLUMN IF NOT EXISTS volume_24hr   numeric NULL;

-- 3. BEFORE INSERT/UPDATE OF event_id on markets — copy from parent event.
CREATE OR REPLACE FUNCTION markets_set_trending_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Same early-exit pattern as markets_set_tag_slugs (migration 069):
  -- bulk_upsert_markets writes event_id every cycle even when unchanged.
  IF TG_OP = 'UPDATE' AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id THEN
    RETURN NEW;
  END IF;

  SELECT e.trending_rank, e.volume_24hr
    INTO NEW.trending_rank, NEW.volume_24hr
    FROM events e
   WHERE e.id = NEW.event_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_markets_set_trending_fields ON markets;

CREATE TRIGGER trg_markets_set_trending_fields
BEFORE INSERT OR UPDATE OF event_id ON markets
FOR EACH ROW
EXECUTE FUNCTION markets_set_trending_fields();

-- 4. AFTER UPDATE OF trending fields on events — propagate to markets.
CREATE OR REPLACE FUNCTION events_propagate_trending_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.trending_rank IS DISTINCT FROM OLD.trending_rank
     OR NEW.volume_24hr IS DISTINCT FROM OLD.volume_24hr THEN
    UPDATE markets
       SET trending_rank = NEW.trending_rank,
           volume_24hr   = NEW.volume_24hr
     WHERE event_id = NEW.id
       AND (trending_rank IS DISTINCT FROM NEW.trending_rank
            OR volume_24hr   IS DISTINCT FROM NEW.volume_24hr);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_propagate_trending_fields ON events;

CREATE TRIGGER trg_events_propagate_trending_fields
AFTER UPDATE OF trending_rank, volume_24hr ON events
FOR EACH ROW
EXECUTE FUNCTION events_propagate_trending_fields();

-- 5. Index supporting the trending feed sort.
--    (trending_rank ASC NULLS LAST, volume_24hr DESC NULLS LAST, id DESC)
--    A partial index on `is_visible = true` mirrors the existing feed indexes.
CREATE INDEX IF NOT EXISTS idx_markets_trending_visible
  ON markets (trending_rank ASC NULLS LAST, volume_24hr DESC NULLS LAST, id DESC)
  WHERE is_visible = true;

-- 6. RPC for the sync function: write trending rankings in one call.
--    Input is a JSON array of {slug, trending_rank?, volume_24hr?}.
--    Events not present in the array have their trending_rank cleared to NULL
--    so a feature drop on Polymarket actually disables our featured ordering.
--    We key on `slug` because that's what Polymarket's /events endpoint
--    returns directly; events.polymarket_id may use a different convention
--    set by the external market-tracker.
CREATE OR REPLACE FUNCTION public.set_events_trending_rankings(p_rankings jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed int;
BEGIN
  WITH input AS (
    SELECT
      r->>'slug'                                  AS slug,
      NULLIF(r->>'trending_rank', '')::int        AS rank,
      NULLIF(r->>'volume_24hr', '')::numeric      AS v24
    FROM jsonb_array_elements(p_rankings) r
    WHERE r ? 'slug'
  ),
  updated_in AS (
    UPDATE events e
       SET trending_rank = i.rank,
           volume_24hr   = COALESCE(i.v24, e.volume_24hr)
      FROM input i
     WHERE e.slug = i.slug
       AND (e.trending_rank IS DISTINCT FROM i.rank
            OR (i.v24 IS NOT NULL AND e.volume_24hr IS DISTINCT FROM i.v24))
     RETURNING 1
  ),
  cleared_out AS (
    -- Clear rank for events that previously had one but are no longer in the
    -- featured set. volume_24hr is left untouched — it's still useful as a
    -- general signal, even when an event is no longer featured.
    UPDATE events e
       SET trending_rank = NULL
     WHERE e.trending_rank IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM input i WHERE i.slug = e.slug)
     RETURNING 1
  )
  SELECT (SELECT count(*) FROM updated_in) + (SELECT count(*) FROM cleared_out)
    INTO v_changed;

  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.set_events_trending_rankings(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.set_events_trending_rankings(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.set_events_trending_rankings(jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.set_events_trending_rankings(jsonb) TO service_role;
