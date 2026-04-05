-- Migration 037: Add archived_at column to markets table
-- Tracks the exact timestamp when a market was archived.

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Backfill: use resolved_at as proxy for existing archived markets
UPDATE markets
  SET archived_at = resolved_at
  WHERE status = 'archived'
    AND archived_at IS NULL;
