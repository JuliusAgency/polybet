-- Migration 011: Sync runs for Polymarket market synchronization progress tracking.

CREATE TABLE sync_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status            text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  phase             text NOT NULL,
  max_pages         integer NOT NULL DEFAULT 0 CHECK (max_pages >= 0),
  progress_current  integer NOT NULL DEFAULT 0 CHECK (progress_current >= 0),
  progress_total    integer NOT NULL DEFAULT 0 CHECK (progress_total >= 0),
  markets_synced    integer NOT NULL DEFAULT 0,
  outcomes_updated  integer NOT NULL DEFAULT 0,
  markets_settled   integer NOT NULL DEFAULT 0,
  errors            jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz
);

CREATE INDEX idx_sync_runs_created_by_created_at
  ON sync_runs (created_by, created_at DESC);

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can view sync runs" ON sync_runs
  FOR SELECT USING (is_super_admin());
