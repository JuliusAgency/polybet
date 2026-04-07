-- Migration 042: Composite indexes for markets feed query performance.
-- Fixes statement timeout on large markets table (100k+ rows).
-- Query pattern: WHERE is_visible = true AND status IN (...) ORDER BY created_at DESC, id DESC LIMIT N

CREATE INDEX IF NOT EXISTS idx_markets_feed
  ON markets (status, created_at DESC, id DESC)
  WHERE is_visible = true;

CREATE INDEX IF NOT EXISTS idx_markets_feed_category
  ON markets (status, category, created_at DESC, id DESC)
  WHERE is_visible = true;
