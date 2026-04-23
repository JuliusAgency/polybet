-- Migration 066: partial B-tree index on markets.close_at for the
-- "Closing today" feed filter.
--
-- Query pattern (from useMarkets when tagSlugFilter='closing-today'):
--   SELECT ...
--   FROM markets
--   WHERE is_visible = true
--     AND close_at >= :todayStart
--     AND close_at <  :tomorrowStart
--     AND status = 'open'           -- when statusFilter='open'
--   ORDER BY sort_volume DESC, created_at DESC, id DESC
--   LIMIT :page_limit;
--
-- Without a close_at index, this degrades to a seq scan on markets (>100k rows).
-- A partial B-tree on close_at, scoped to the visible-feed slice, keeps the
-- index small and supports the [gte, lt) range lookup in log time.

CREATE INDEX IF NOT EXISTS idx_markets_close_at_visible
  ON markets (close_at)
  WHERE is_visible = true AND close_at IS NOT NULL;
