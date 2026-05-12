-- Hybrid Trending feed: featured-set (trending_rank ASC) followed by the rest
-- of visible markets ordered by sort_volume DESC.
--
-- Background: the previous trending feed filtered to `trending_rank IS NOT NULL`,
-- which produced ~30 cards because Polymarket's featured set is small.
-- useMarkets.ts now drops that filter and orders by
-- (trending_rank ASC NULLS LAST, sort_volume DESC NULLS LAST, id DESC).
--
-- sort_volume (denormalized from events.volume, migration 057) is the popularity
-- signal used here because events.volume_24hr is only populated for events
-- currently in the Polymarket featured set; sort_volume is populated for every
-- visible market.
--
-- A composite partial index that matches the new ORDER BY lets the planner
-- walk it directly instead of sorting after a heap scan.

CREATE INDEX IF NOT EXISTS idx_markets_trending_sort_volume_visible
  ON markets (trending_rank ASC NULLS LAST, sort_volume DESC NULLS LAST, id DESC)
  WHERE is_visible = true;

-- Keep idx_markets_trending_visible (migration 075) for now — it is still a
-- valid covering index for the legacy (trending_rank, volume_24hr, id) sort
-- and can be dropped in a follow-up once we are confident nothing depends on it.
