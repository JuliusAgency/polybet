-- Migration 043: Add market_outcomes to Supabase Realtime publication
--
-- The frontend subscribes to Realtime postgres_changes on market_outcomes
-- (useMarkets.ts:152-165) but the table was never added to the publication.
-- This makes the subscription dead code — outcome price updates from
-- refresh-markets and sync-polymarket-markets are never broadcast.
--
-- Prerequisites:
--   - RLS enabled on market_outcomes (migration 039)
--   - SELECT policy for authenticated users (migration 008)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'market_outcomes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE market_outcomes;
  END IF;
END $$;
