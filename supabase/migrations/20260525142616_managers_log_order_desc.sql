-- QA 2026-05-25 (Bug 1): the exported "Action Log" report (managers_log) listed
-- the oldest action first. Recent actions must appear at the top.
-- Flip the ordering to newest-first; tie-break by id DESC for stable ordering on
-- identical timestamps. Only the ORDER BY changes vs migration 032.

CREATE OR REPLACE FUNCTION admin_build_managers_log_dataset(
  p_started_at timestamptz DEFAULT NULL,
  p_ended_at   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH _guard AS (SELECT admin_require_super_admin())
  SELECT jsonb_build_object(
    'rows', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'created_at',      al.created_at,
            'action',          al.action,
            'target_username', tp.username,
            'actor_username',  ap.username,
            'actor_role',      ap.role
          )
          ORDER BY al.created_at DESC, al.id DESC
        )
        FROM admin_action_logs al
        JOIN profiles tp ON tp.id = al.target_id
        JOIN profiles ap ON ap.id = al.initiated_by
        WHERE (p_started_at IS NULL OR al.created_at >= p_started_at)
          AND (p_ended_at   IS NULL OR al.created_at <= p_ended_at)
      ),
      '[]'::jsonb
    )
  );
$$;
