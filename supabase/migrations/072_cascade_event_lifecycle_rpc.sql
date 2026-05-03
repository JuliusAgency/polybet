-- Migration 072: cascade_event_lifecycle RPC
--
-- Replaces the JS-side cascade in services/market-tracker/src/db/batchWriter.ts
-- (`cascadeEventLifecycle`) with a single server-side function. The JS version
-- pulled the candidate event ids and then re-queried `markets` in chunks of
-- 500 with `event_id=in.(...)`. Each request URL hit ~19,600 chars on the
-- production catalog, exceeding Supabase's 16KB header limit and blowing up
-- with `HeadersOverflowError`.
--
-- This RPC does the entire cascade in one call:
--   1. Pick events whose status is non-terminal (open/closed/resolved).
--   2. Aggregate child-market statuses inline via LATERAL.
--   3. Flip events whose every child is archived → 'archived'.
--   4. Flip events whose every child is in {resolved, archived} AND at least
--      one child is resolved → 'resolved'.
--   5. Return counts so the caller can log them.
--
-- Same business rules as the JS version it replaces; behaviour is identical
-- on event lifecycle. The function is SECURITY DEFINER and locked to
-- service_role since it's only called from the long-running market-tracker
-- worker (no end-user surface).

CREATE OR REPLACE FUNCTION cascade_event_lifecycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now           timestamptz := now();
  v_archived_cnt  int := 0;
  v_resolved_cnt  int := 0;
BEGIN
  -- Reject end-user calls; this is a worker-only function.
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
      RAISE EXCEPTION 'Permission denied: only super_admin or service role';
    END IF;
  END IF;

  WITH candidate_events AS (
    SELECT e.id, e.status
    FROM events e
    WHERE e.status IN ('open', 'closed', 'resolved')
  ),
  agg AS (
    SELECT
      ce.id                                         AS event_id,
      ce.status                                     AS event_status,
      bool_and(m.status = 'archived')               AS all_archived,
      bool_and(m.status IN ('resolved', 'archived')) AS all_terminal,
      bool_or (m.status = 'resolved')               AS any_resolved,
      count(*)                                       AS child_count
    FROM candidate_events ce
    JOIN markets m ON m.event_id = ce.id
    GROUP BY ce.id, ce.status
  ),
  to_archive AS (
    SELECT event_id
    FROM agg
    WHERE child_count > 0
      AND all_archived = true
      AND event_status <> 'archived'
  ),
  to_resolve AS (
    SELECT event_id
    FROM agg
    WHERE child_count > 0
      AND all_terminal = true
      AND any_resolved = true
      AND event_status NOT IN ('resolved', 'archived')
  ),
  do_archive AS (
    UPDATE events
    SET status = 'archived', archived_at = v_now
    WHERE id IN (SELECT event_id FROM to_archive)
    RETURNING 1
  ),
  do_resolve AS (
    UPDATE events
    SET status = 'resolved', resolved_at = v_now
    WHERE id IN (SELECT event_id FROM to_resolve)
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM do_archive),
    (SELECT count(*) FROM do_resolve)
  INTO v_archived_cnt, v_resolved_cnt;

  RETURN jsonb_build_object(
    'archived', v_archived_cnt,
    'resolved', v_resolved_cnt
  );
END;
$$;

REVOKE ALL ON FUNCTION cascade_event_lifecycle() FROM public;
REVOKE ALL ON FUNCTION cascade_event_lifecycle() FROM anon;
REVOKE ALL ON FUNCTION cascade_event_lifecycle() FROM authenticated;
GRANT EXECUTE ON FUNCTION cascade_event_lifecycle() TO service_role;
