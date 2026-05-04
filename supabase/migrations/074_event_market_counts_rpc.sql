-- Migration 074: event_market_counts RPC
--
-- Returns total markets count per event id, bypassing the
-- "Authenticated users read visible markets" RLS policy on `markets`
-- (008_manager_rpc_rls.sql:138-140) which would otherwise hide
-- is_visible=false rows from the count.
--
-- Used by `useEventMarketCounts` (frontend) so EventBookmarkButton can
-- render its 'partial' state when the user has saved a market that is no
-- longer visible (closed/cleaned-up) — without this RPC the denominator
-- equals the loaded count and state collapses to 'all'.

DROP FUNCTION IF EXISTS public.event_market_counts(uuid[]);

CREATE OR REPLACE FUNCTION public.event_market_counts(p_event_ids uuid[])
RETURNS TABLE(event_id uuid, market_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT m.event_id, count(*)::bigint
  FROM markets m
  WHERE m.event_id = ANY(p_event_ids)
  GROUP BY m.event_id;
$$;

REVOKE ALL ON FUNCTION public.event_market_counts(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.event_market_counts(uuid[]) TO authenticated;
