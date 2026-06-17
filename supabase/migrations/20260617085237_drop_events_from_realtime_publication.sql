-- Drop `events` from the supabase_realtime publication.
--
-- `events` was added to the publication speculatively in migration 048
-- (events_hierarchy) but no client ever subscribed to it: the frontend, the
-- edge functions, and the market-tracker service were all audited and none
-- open a postgres_changes channel on `events`. App-facing realtime is limited
-- to per-user tables (balances, balance_transactions, bets, profiles).
--
-- Meanwhile the Polymarket sync rewrites `events` continuously (volume,
-- trending_rank, tag_slugs, and the new World Cup teams/sport/game_start_time
-- fields). Every such UPDATE is captured by logical decoding, so
-- realtime.list_changes() was spending 12-15s per cycle decoding changes that
-- have zero subscribers. That backlog saturated WAL decoding and the connection
-- pool and surfaced as `canceling statement due to statement timeout` on the
-- markets feed read path (which is otherwise a ~90ms indexed query).
--
-- This mirrors migration 069, which removed `markets` and `market_outcomes`
-- from the same publication for exactly this reason. Removing a table from a
-- publication is a metadata-only operation with no dependent objects.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE events;
  END IF;
END $$;
