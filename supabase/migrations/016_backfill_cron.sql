-- Migration 016: Schedule hourly backfill cron job
--
-- REQUIRES: 014_cron_jobs.sql (pg_cron extension must be enabled, vault secret 'service_role_key' must exist)

-- Schedule hourly backfill: check all markets with open bets against Polymarket
-- and settle any that have resolved. Runs at :30 to avoid collision with
-- the :00/:05 resolved_only and active_page jobs.
SELECT cron.schedule(
  'backfill-open-bets',
  '30 * * * *',
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
      body    := '{"mode":"backfill"}'::jsonb
    );
  $cron$
);
