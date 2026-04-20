-- Migration 055: hand market lifecycle orchestration to the market-tracker service.
--
-- Historically pg_cron drove three things:
--   1. 'close-expired-markets'       — migration 045, runs every minute,
--                                      flips markets.status to 'closed'
--                                      when close_at passes.
--   2. 'settle-resolved-bets'        — migration 014, runs every 5 minutes,
--                                      hits the legacy sync-polymarket-markets
--                                      edge function to resolve bets.
--   3. 'sync-active-markets-page'    — migration 014, runs every 5 minutes,
--                                      paginates active markets through the
--                                      same legacy edge function.
--
-- All three are superseded by market-tracker:
--   (1) becomes a tick in scheduler/tasks.ts (closeExpiredMarkets) that calls
--       the close_expired_markets() RPC. The function stays; only the
--       scheduling moves.
--   (2) is replaced by resolutionScan + WebSocket resolutionDetector.
--   (3) is replaced by eventCrawl + lifecycleCrawl.
--
-- Running both would double-process the same state transitions, so we
-- retire the pg_cron schedule here. The close_expired_markets() function
-- itself is preserved — the service calls it via supabase.rpc(...).

DO $$
DECLARE
  v_dropped int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-expired-markets') THEN
    PERFORM cron.unschedule('close-expired-markets');
    v_dropped := v_dropped + 1;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'settle-resolved-bets') THEN
    PERFORM cron.unschedule('settle-resolved-bets');
    v_dropped := v_dropped + 1;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-active-markets-page') THEN
    PERFORM cron.unschedule('sync-active-markets-page');
    v_dropped := v_dropped + 1;
  END IF;

  RAISE NOTICE 'migration 055: unscheduled % pg_cron job(s)', v_dropped;
END $$;
