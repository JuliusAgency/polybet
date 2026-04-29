-- Seed: Local admin activity for development.
-- Adds password-reset action logs and a single sync_runs row so the admin
-- UI is not empty after `supabase db reset`.
-- No demo markets, outcomes, deposits, or bets — those are exercised by hand
-- and synced from Polymarket via the market-tracker service.
-- Depends on 002_test_users.sql.

DO $$
DECLARE
  admin_id    uuid := '00000000-0000-0000-0000-000000000001';
  user2_id    uuid := '00000000-0000-0000-0000-000000000004';
  user3_id    uuid := '00000000-0000-0000-0000-000000000005';

  action_reset_user2_id  uuid := '14000000-0000-0000-0000-000000000001';
  action_reset_user3_id  uuid := '14000000-0000-0000-0000-000000000002';

  sync_run_demo_id       uuid := '15000000-0000-0000-0000-000000000001';
BEGIN
  -- Account activity history for manager profile page
  INSERT INTO admin_action_logs (id, created_at, action, target_id, initiated_by)
  VALUES
    (action_reset_user2_id, '2026-03-20T09:45:00Z', 'reset_password', user2_id, admin_id),
    (action_reset_user3_id, '2026-03-20T09:50:00Z', 'reset_password', user3_id, admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- Sync history so the admin sync UI is not empty after reset
  INSERT INTO sync_runs (
    id, created_by, status, phase, max_pages, progress_current, progress_total,
    markets_synced, outcomes_updated, markets_settled, errors, error_message,
    created_at, started_at, updated_at, finished_at
  ) VALUES (
    sync_run_demo_id,
    admin_id,
    'completed',
    'demo_seeded',
    1,
    0,
    0,
    0,
    0,
    0,
    '[]'::jsonb,
    NULL,
    '2026-03-20T16:00:00Z',
    '2026-03-20T16:00:00Z',
    '2026-03-20T16:01:00Z',
    '2026-03-20T16:01:00Z'
  )
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Admin activity history seeded (no markets/bets/deposits)';
END;
$$;
