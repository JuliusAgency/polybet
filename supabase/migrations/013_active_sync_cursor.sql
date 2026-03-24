-- Migration 013: Active sync cursor
-- Stores the current offset for incremental active markets sync.
-- pg_cron jobs advance this offset one page at a time instead of
-- fetching all markets in a single long-running call.

INSERT INTO system_settings (key, value)
VALUES ('active_sync_offset', '0')
ON CONFLICT (key) DO NOTHING;
