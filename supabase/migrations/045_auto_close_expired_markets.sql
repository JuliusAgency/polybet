-- Migration 045: Auto-close markets whose close_at has passed
--
-- Problem: markets remain status='open' after close_at because status
-- only updates when the Polymarket API returns closed=true. This creates
-- a window where expired markets appear open in the UI.
--
-- Fix: a pg_cron job runs every minute and flips status to 'closed'
-- for any market where close_at < now() and status = 'open'.

CREATE OR REPLACE FUNCTION close_expired_markets()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE markets
  SET status = 'closed'
  WHERE status = 'open'
    AND close_at IS NOT NULL
    AND close_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Run every minute to catch expired markets quickly
SELECT cron.schedule(
  'close-expired-markets',
  '* * * * *',
  $$SELECT close_expired_markets()$$
);
