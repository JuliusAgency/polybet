-- Reschedule the hot_set sync cron from every minute to every 5 minutes.
--
-- Migration 029 created the 'sync-hot-set-markets' pg_cron job at '*/1 * * * *'.
-- Each invocation of sync-polymarket-markets (mode=hot_set) takes 2-4 minutes,
-- so a 1-minute schedule launches a new run while 2-3 previous runs are still
-- in flight. Those concurrent runs upsert the same markets/market_outcomes/
-- events rows in different orders, producing AB-BA deadlocks and multi-second
-- ShareLock waits (observed in prod postgres logs), which saturate the
-- connection pool and surface as `canceling statement due to statement timeout`
-- on the markets feed read path.
--
-- The market-tracker service (Heroku, 24/7) is the authoritative live writer
-- (CLOB websocket + 1s book flush), so the edge hot_set sync only needs to be
-- a low-frequency safety refresh. Every 5 minutes comfortably clears one run
-- before the next tick.
--
-- Alter by jobname (the jobid is environment-specific). Guarded so a fresh
-- db reset — where 029 has just created the job — and any environment missing
-- the job both no-op cleanly.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'sync-hot-set-markets';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(job_id => v_jobid, schedule => '*/5 * * * *');
    RAISE NOTICE 'migration: rescheduled sync-hot-set-markets to */5 (jobid %)', v_jobid;
  ELSE
    RAISE NOTICE 'migration: sync-hot-set-markets cron not found; nothing to reschedule';
  END IF;
END $$;
