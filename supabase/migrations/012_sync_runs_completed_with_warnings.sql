-- Migration 012: allow sync runs that completed successfully with non-fatal warnings.

ALTER TABLE sync_runs
  DROP CONSTRAINT IF EXISTS sync_runs_status_check;

ALTER TABLE sync_runs
  ADD CONSTRAINT sync_runs_status_check
  CHECK (status IN ('running', 'completed', 'completed_with_warnings', 'failed'));
