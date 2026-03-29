-- Migration 029: Polymarket hot-set sync + market data deltas

-- 1) Extend markets with source/sync metadata
ALTER TABLE markets ADD COLUMN IF NOT EXISTS polymarket_status_raw text;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

-- 2) Store raw probability/price alongside odds
ALTER TABLE market_outcomes
  ADD COLUMN IF NOT EXISTS price numeric CHECK (price >= 0 AND price <= 1);

-- 3) Delta history table
CREATE TABLE IF NOT EXISTS market_data_deltas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id           uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  outcome_id          uuid REFERENCES market_outcomes(id) ON DELETE SET NULL,
  polymarket_id       text NOT NULL,
  polymarket_token_id text,
  event_type          text NOT NULL CHECK (event_type IN ('market_created', 'status_changed', 'outcome_price_changed', 'market_resolved')),
  old_value           text,
  new_value           text,
  run_id              uuid REFERENCES sync_runs(id) ON DELETE SET NULL,
  changed_at          timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_data_deltas_market_changed_at
  ON market_data_deltas (market_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_data_deltas_event_type
  ON market_data_deltas (event_type);

CREATE INDEX IF NOT EXISTS idx_market_data_deltas_polymarket_id
  ON market_data_deltas (polymarket_id);

-- 4) Optional setting for UI/ops visibility
INSERT INTO system_settings (key, value)
VALUES ('hot_sync_interval_seconds', '60')
ON CONFLICT (key) DO NOTHING;

-- 5) RLS and policies
ALTER TABLE market_data_deltas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can view market data deltas" ON market_data_deltas
  FOR SELECT USING (is_super_admin());

-- 6) Minute hot-set cron (safe: create only when pg_cron is available and job not present)
DO $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'sync-hot-set-markets'
  ) THEN
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'sync-hot-set-markets',
    '*/1 * * * *',
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
        body    := '{"mode":"hot_set"}'::jsonb
      );
    $cron$
  );
END;
$$;
