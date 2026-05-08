-- Migration 076: only assign trending_rank to visible events.
--
-- Background: migration 075 added the set_events_trending_rankings RPC that
-- writes Polymarket's curated featured order onto events.trending_rank. The
-- denormalization trigger then copies the value onto markets.trending_rank,
-- which the markets feed sorts by for the Trending tab.
--
-- Bug: events.is_visible is independent of the Polymarket featured set —
-- admins can hide an event (e.g. flagged for legal/compliance reasons) while
-- it remains featured on Polymarket. The previous RPC assigned trending_rank
-- to those hidden events anyway. Markets keyed under a hidden event still
-- show up in the Trending feed via the denormalized rank, but clicking the
-- event card hits an RLS-protected events query
-- (`is_visible = true AND auth.uid() IS NOT NULL`) and returns null —
-- surfacing as "Event not found or failed to load".
--
-- Fix: scope the UPDATE to visible events only, and explicitly clear
-- trending_rank from hidden events that previously had one so toggling
-- visibility off immediately removes the event from Trending.

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
       AND e.is_visible = true
       AND (e.trending_rank IS DISTINCT FROM i.rank
            OR (i.v24 IS NOT NULL AND e.volume_24hr IS DISTINCT FROM i.v24))
     RETURNING 1
  ),
  cleared_not_featured AS (
    -- Visible events that dropped out of the Polymarket featured set: clear
    -- rank so they leave the Trending tab. volume_24hr stays — useful as a
    -- general signal even when no longer featured.
    UPDATE events e
       SET trending_rank = NULL
     WHERE e.trending_rank IS NOT NULL
       AND e.is_visible = true
       AND NOT EXISTS (SELECT 1 FROM input i WHERE i.slug = e.slug)
     RETURNING 1
  ),
  cleared_hidden AS (
    -- Events that became hidden while still in the Polymarket featured set:
    -- strip their rank so they don't show up as orphan rows in the feed.
    UPDATE events e
       SET trending_rank = NULL
     WHERE e.trending_rank IS NOT NULL
       AND e.is_visible IS NOT TRUE
     RETURNING 1
  )
  SELECT (SELECT count(*) FROM updated_in)
       + (SELECT count(*) FROM cleared_not_featured)
       + (SELECT count(*) FROM cleared_hidden)
    INTO v_changed;

  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.set_events_trending_rankings(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.set_events_trending_rankings(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.set_events_trending_rankings(jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.set_events_trending_rankings(jsonb) TO service_role;

-- One-shot: clear trending_rank from any currently-hidden events so the next
-- markets feed query no longer surfaces them. Trigger on events propagates
-- the NULL to markets.trending_rank automatically.
UPDATE events
   SET trending_rank = NULL
 WHERE trending_rank IS NOT NULL
   AND is_visible IS NOT TRUE;
