-- Migration 032: Replace 5 report types with 3 focused types
-- managers_log: admin_action_logs
-- bets_log: bets with user/manager/market context
-- system_dashboard: system-wide KPIs + counts

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
          ORDER BY al.created_at, al.id
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

CREATE OR REPLACE FUNCTION admin_build_bets_log_dataset(
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
            'placed_at',          b.placed_at,
            'user_username',      up.username,
            'manager_username',   (
              SELECT mp.username
              FROM manager_user_links mul
              JOIN profiles mp ON mp.id = mul.manager_id
              WHERE mul.user_id = b.user_id
              ORDER BY mul.manager_id
              LIMIT 1
            ),
            'market_description', mk.question,
            'stake',              b.stake,
            'locked_odds',        b.locked_odds,
            'potential_payout',   b.potential_payout,
            'status',             b.status
          )
          ORDER BY b.placed_at, b.id
        )
        FROM bets b
        JOIN markets  mk ON mk.id = b.market_id
        JOIN profiles up ON up.id = b.user_id
        WHERE (p_started_at IS NULL OR b.placed_at >= p_started_at)
          AND (p_ended_at   IS NULL OR b.placed_at <= p_ended_at)
      ),
      '[]'::jsonb
    )
  );
$$;

CREATE OR REPLACE FUNCTION admin_build_system_dashboard_dataset(
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
    'kpis', jsonb_build_object(
      'total_system_points', COALESCE(
        (SELECT SUM(available + in_play) FROM balances), 0
      ),
      'open_exposure', COALESCE(
        (
          SELECT SUM(stake) FROM bets
          WHERE status = 'open'
            AND (p_started_at IS NULL OR placed_at >= p_started_at)
            AND (p_ended_at   IS NULL OR placed_at <= p_ended_at)
        ), 0
      ),
      'system_profit', COALESCE(
        (
          SELECT SUM(
            CASE
              WHEN status = 'won'  THEN stake - potential_payout
              WHEN status = 'lost' THEN stake
              ELSE 0
            END
          )
          FROM bets
          WHERE settled_at IS NOT NULL
            AND (p_started_at IS NULL OR settled_at >= p_started_at)
            AND (p_ended_at   IS NULL OR settled_at <= p_ended_at)
        ), 0
      )
    ),
    'counts', jsonb_build_object(
      'users',    (SELECT COUNT(*) FROM profiles WHERE role = 'user'),
      'managers', (SELECT COUNT(*) FROM profiles WHERE role = 'manager'),
      'markets',  (SELECT COUNT(*) FROM markets)
    )
  );
$$;

CREATE OR REPLACE FUNCTION admin_get_report_dataset(
  p_report_type text,
  p_started_at  timestamptz DEFAULT NULL,
  p_ended_at    timestamptz DEFAULT NULL,
  p_manager_id  uuid        DEFAULT NULL,
  p_user_id     uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dataset jsonb := '{}'::jsonb;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  IF p_started_at IS NOT NULL
     AND p_ended_at IS NOT NULL
     AND p_started_at > p_ended_at THEN
    RAISE EXCEPTION 'Invalid report range: started_at must be before ended_at';
  END IF;

  CASE p_report_type
    WHEN 'managers_log' THEN
      v_dataset := admin_build_managers_log_dataset(p_started_at, p_ended_at);
    WHEN 'bets_log' THEN
      v_dataset := admin_build_bets_log_dataset(p_started_at, p_ended_at);
    WHEN 'system_dashboard' THEN
      v_dataset := admin_build_system_dashboard_dataset(p_started_at, p_ended_at);
    ELSE
      RAISE EXCEPTION 'Unsupported report_type: %', p_report_type;
  END CASE;

  RETURN jsonb_build_object(
    'report_type',  p_report_type,
    'generated_at', now(),
    'filters',      jsonb_build_object(
      'started_at', p_started_at,
      'ended_at',   p_ended_at
    ),
    'data', v_dataset
  );
END;
$$;
