-- Migration 014: pg_cron jobs for automatic market sync
--
-- PREREQUISITES (run once manually in Supabase SQL Editor before applying this migration):
--
--   SELECT vault.create_secret(
--     '<SUPABASE_SERVICE_ROLE_KEY>',
--     'service_role_key',
--     'Service role key for pg_cron -> edge function calls'
--   );
--
-- This stores the key encrypted in Supabase Vault so it can be
-- referenced securely from pg_cron jobs without hardcoding it.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant pg_cron scheduling permissions to the postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- ── Job 1: Settle resolved bets ─────────────────────────────────────────────
-- Runs every 5 minutes. Fetches only resolved markets (max 2 pages = 100).
-- Fast (~3s). Ensures bets are settled promptly after markets close.
SELECT cron.schedule(
  'settle-resolved-bets',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://zmimvdfjptkxvtdebwfz.supabase.co/functions/v1/sync-polymarket-markets',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1
      )
    ),
    body    := '{"mode":"resolved_only"}'::jsonb
  );
  $cron$
);

-- ── Job 2: Incremental active markets sync ──────────────────────────────────
-- Runs every 5 minutes. Fetches one page (100 markets) at the current cursor
-- offset stored in system_settings.active_sync_offset, then advances the
-- cursor. Resets to 0 when the last page is reached (page has < 100 markets).
-- Full cycle time: ceil(total_markets / 100) * 5 minutes.
SELECT cron.schedule(
  'sync-active-markets-page',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://zmimvdfjptkxvtdebwfz.supabase.co/functions/v1/sync-polymarket-markets',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1
      )
    ),
    body    := '{"mode":"active_page"}'::jsonb
  );
  $cron$
);
