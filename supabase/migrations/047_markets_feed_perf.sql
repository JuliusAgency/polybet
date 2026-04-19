-- Migration 047: Markets feed performance fix.
--
-- Symptom: GET /markets times out with 500 "canceling statement due to statement timeout"
-- on ~170k markets under the `authenticated` role.
--
-- Root causes (verified via EXPLAIN ANALYZE, 2.7s for 50 rows):
--   1. `status IN (open,closed,resolved,archived)` covers 100% of the domain, so the
--      planner ignores the partial index `idx_markets_feed` and falls back to Seq Scan.
--   2. RLS policies call `is_super_admin()` and `auth.uid()` once per row (168k times)
--      instead of once per query, because they are not wrapped in `(SELECT ...)`.
--   3. There is no index that supports the "all statuses" case ordered by
--      created_at DESC, id DESC.
--
-- Fix:
--   1. Re-create both markets SELECT policies with (SELECT ...) wrappers so Postgres
--      evaluates the helpers once per query (initPlan) instead of per row.
--   2. Add idx_markets_visible_feed (created_at DESC, id DESC) WHERE is_visible = true
--      so the "all" feed path can walk the index in order and stop at LIMIT.

-- ------------------------------------------------------------
-- 1. Re-create markets SELECT policies with cached helper calls
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users read visible markets" ON markets;
CREATE POLICY "Authenticated users read visible markets" ON markets FOR SELECT
  USING (is_visible = true AND (SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Super admin reads all markets" ON markets;
CREATE POLICY "Super admin reads all markets" ON markets FOR SELECT
  USING ((SELECT is_super_admin()));

-- ------------------------------------------------------------
-- 2. Feed index that works regardless of status filter
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_markets_visible_feed
  ON markets (created_at DESC, id DESC)
  WHERE is_visible = true;
