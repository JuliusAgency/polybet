-- Migration 059: per-user favorite markets (bookmark / save-for-later)
--
-- QA-driven addition: users want to save interesting markets from the feed.
-- Scope: markets only (EventCard reuses the same table via its primary market —
-- or, in the future, a sibling table — but for now the feed's bookmark icon
-- always binds to a market_id).
--
-- Table is intentionally minimal: (user_id, market_id) is the natural key, so
-- we use a composite primary key instead of a surrogate id.

CREATE TABLE IF NOT EXISTS user_favorite_markets (
  user_id     uuid        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  market_id   uuid        NOT NULL REFERENCES markets(id)   ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, market_id)
);

-- Fast "my favorites" fetch ordered by save time.
CREATE INDEX IF NOT EXISTS idx_user_favorite_markets_user_created
  ON user_favorite_markets (user_id, created_at DESC);

ALTER TABLE user_favorite_markets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own favorite markets" ON user_favorite_markets;
CREATE POLICY "Users read own favorite markets" ON user_favorite_markets FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users add own favorite markets" ON user_favorite_markets;
CREATE POLICY "Users add own favorite markets" ON user_favorite_markets FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users remove own favorite markets" ON user_favorite_markets;
CREATE POLICY "Users remove own favorite markets" ON user_favorite_markets FOR DELETE
  USING (user_id = auth.uid());
