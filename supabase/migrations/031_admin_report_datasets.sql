-- Migration 031: Admin report dataset helpers for PDF export
-- Provides stable JSON dataset builders behind a super-admin-only RPC surface.

CREATE OR REPLACE FUNCTION admin_require_super_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_build_system_summary_report_dataset(
  p_started_at timestamptz DEFAULT NULL,
  p_ended_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH _guard AS (
    SELECT admin_require_super_admin()
  ),
  manager_snapshots AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'manager_id', m.id,
          'username', m.username,
          'full_name', m.full_name,
          'is_active', m.is_active,
          'created_at', m.created_at,
          'balance', COALESCE(mgr.balance, 0),
          'margin', COALESCE(mgr.margin, 0),
          'max_bet_limit', mgr.max_bet_limit,
          'max_win_limit', mgr.max_win_limit,
          'linked_user_count', COALESCE((
            SELECT COUNT(*)
            FROM manager_user_links mul
            WHERE mul.manager_id = m.id
          ), 0)
        )
        ORDER BY m.created_at, m.id
      ),
      '[]'::jsonb
    ) AS rows
    FROM profiles m
    JOIN managers mgr ON mgr.id = m.id
    WHERE m.role = 'manager'
  ),
  user_snapshots AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'user_id', p.id,
          'username', p.username,
          'full_name', p.full_name,
          'is_active', p.is_active,
          'created_at', p.created_at,
          'available_balance', COALESCE(bal.available, 0),
          'in_play_balance', COALESCE(bal.in_play, 0),
          'manager_ids', COALESCE((
            SELECT jsonb_agg(mul.manager_id ORDER BY mul.manager_id)
            FROM manager_user_links mul
            WHERE mul.user_id = p.id
          ), '[]'::jsonb)
        )
        ORDER BY p.created_at, p.id
      ),
      '[]'::jsonb
    ) AS rows
    FROM profiles p
    LEFT JOIN balances bal ON bal.user_id = p.id
    WHERE p.role = 'user'
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'turnover', COALESCE((
        SELECT SUM(b.stake)
        FROM bets b
        WHERE (p_started_at IS NULL OR b.placed_at >= p_started_at)
          AND (p_ended_at IS NULL OR b.placed_at <= p_ended_at)
      ), 0),
      'settled_pnl', COALESCE((
        SELECT SUM(
          CASE
            WHEN b.status = 'won' THEN b.potential_payout - b.stake
            WHEN b.status = 'lost' THEN -b.stake
            ELSE 0
          END
        )
        FROM bets b
        WHERE b.settled_at IS NOT NULL
          AND (p_started_at IS NULL OR b.settled_at >= p_started_at)
          AND (p_ended_at IS NULL OR b.settled_at <= p_ended_at)
      ), 0),
      'open_exposure', COALESCE((
        SELECT SUM(b.stake)
        FROM bets b
        WHERE b.status = 'open'
          AND (p_started_at IS NULL OR b.placed_at >= p_started_at)
          AND (p_ended_at IS NULL OR b.placed_at <= p_ended_at)
      ), 0),
      'active_user_count', COALESCE((
        SELECT COUNT(*)
        FROM profiles p
        WHERE p.role = 'user'
          AND p.is_active = true
      ), 0),
      'blocked_user_count', COALESCE((
        SELECT COUNT(*)
        FROM profiles p
        WHERE p.role = 'user'
          AND p.is_active = false
      ), 0)
    ),
    'manager_snapshots', (SELECT rows FROM manager_snapshots),
    'user_snapshots', (SELECT rows FROM user_snapshots)
  );
$$;

CREATE OR REPLACE FUNCTION admin_build_managers_performance_report_dataset(
  p_started_at timestamptz DEFAULT NULL,
  p_ended_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH _guard AS (
    SELECT admin_require_super_admin()
  ),
  manager_linked_users AS (
    SELECT DISTINCT mul.user_id
    FROM manager_user_links mul
  ),
  manager_linked_bets AS (
    SELECT DISTINCT b.id, b.user_id, b.stake, b.potential_payout, b.status, b.placed_at, b.settled_at
    FROM bets b
    JOIN manager_linked_users mlu ON mlu.user_id = b.user_id
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'manager_count', COALESCE((
        SELECT COUNT(*)
        FROM profiles m
        WHERE m.role = 'manager'
      ), 0),
      'group_turnover', COALESCE((
        SELECT SUM(mlb.stake)
        FROM manager_linked_bets mlb
        WHERE (p_started_at IS NULL OR mlb.placed_at >= p_started_at)
          AND (p_ended_at IS NULL OR mlb.placed_at <= p_ended_at)
      ), 0),
      'group_pnl', COALESCE((
        SELECT SUM(
          CASE
            WHEN mlb.status = 'won' THEN mlb.potential_payout - mlb.stake
            WHEN mlb.status = 'lost' THEN -mlb.stake
            ELSE 0
          END
        )
        FROM manager_linked_bets mlb
        WHERE mlb.settled_at IS NOT NULL
          AND (p_started_at IS NULL OR mlb.settled_at >= p_started_at)
          AND (p_ended_at IS NULL OR mlb.settled_at <= p_ended_at)
      ), 0),
      'open_exposure', COALESCE((
        SELECT SUM(mlb.stake)
        FROM manager_linked_bets mlb
        WHERE mlb.status = 'open'
          AND (p_started_at IS NULL OR mlb.placed_at >= p_started_at)
          AND (p_ended_at IS NULL OR mlb.placed_at <= p_ended_at)
      ), 0)
    ),
    'rows', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'manager_id', m.id,
          'username', m.username,
          'full_name', m.full_name,
          'is_active', m.is_active,
          'created_at', m.created_at,
          'manager_balance', COALESCE(mgr.balance, 0),
          'margin', COALESCE(mgr.margin, 0),
          'max_bet_limit', mgr.max_bet_limit,
          'max_win_limit', mgr.max_win_limit,
          'linked_user_count', COALESCE((
            SELECT COUNT(*)
            FROM manager_user_links mul
            WHERE mul.manager_id = m.id
          ), 0),
          'active_user_count', COALESCE((
            SELECT COUNT(*)
            FROM manager_user_links mul
            JOIN profiles p ON p.id = mul.user_id
            WHERE mul.manager_id = m.id
              AND p.role = 'user'
              AND p.is_active = true
          ), 0),
          'blocked_user_count', COALESCE((
            SELECT COUNT(*)
            FROM manager_user_links mul
            JOIN profiles p ON p.id = mul.user_id
            WHERE mul.manager_id = m.id
              AND p.role = 'user'
              AND p.is_active = false
          ), 0),
          'group_balance', COALESCE((
            SELECT SUM(COALESCE(bal.available, 0) + COALESCE(bal.in_play, 0))
            FROM manager_user_links mul
            LEFT JOIN balances bal ON bal.user_id = mul.user_id
            WHERE mul.manager_id = m.id
          ), 0),
          'group_turnover', COALESCE((
            SELECT SUM(b.stake)
            FROM manager_user_links mul
            JOIN bets b ON b.user_id = mul.user_id
            WHERE mul.manager_id = m.id
              AND (p_started_at IS NULL OR b.placed_at >= p_started_at)
              AND (p_ended_at IS NULL OR b.placed_at <= p_ended_at)
          ), 0),
          'group_pnl', COALESCE((
            SELECT SUM(
              CASE
                WHEN b.status = 'won' THEN b.potential_payout - b.stake
                WHEN b.status = 'lost' THEN -b.stake
                ELSE 0
              END
            )
            FROM manager_user_links mul
            JOIN bets b ON b.user_id = mul.user_id
            WHERE mul.manager_id = m.id
              AND b.settled_at IS NOT NULL
              AND (p_started_at IS NULL OR b.settled_at >= p_started_at)
              AND (p_ended_at IS NULL OR b.settled_at <= p_ended_at)
          ), 0),
          'open_exposure', COALESCE((
            SELECT SUM(b.stake)
            FROM manager_user_links mul
            JOIN bets b ON b.user_id = mul.user_id
            WHERE mul.manager_id = m.id
              AND b.status = 'open'
              AND (p_started_at IS NULL OR b.placed_at >= p_started_at)
              AND (p_ended_at IS NULL OR b.placed_at <= p_ended_at)
          ), 0)
        )
        ORDER BY m.created_at, m.id
      )
      FROM profiles m
      JOIN managers mgr ON mgr.id = m.id
      WHERE m.role = 'manager'
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION admin_build_manager_detailed_report_dataset(
  p_started_at timestamptz DEFAULT NULL,
  p_ended_at timestamptz DEFAULT NULL,
  p_manager_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH _guard AS (
    SELECT admin_require_super_admin()
  ),
  manager_profile AS (
    SELECT
      m.id,
      m.username,
      m.full_name,
      m.is_active,
      m.created_at,
      COALESCE(mgr.balance, 0) AS manager_balance,
      COALESCE(mgr.margin, 0) AS margin,
      mgr.max_bet_limit,
      mgr.max_win_limit
    FROM profiles m
    JOIN managers mgr ON mgr.id = m.id
    WHERE m.id = p_manager_id
      AND m.role = 'manager'
  ),
  managed_user_ids AS (
    SELECT p.id
    FROM manager_user_links mul
    JOIN profiles p ON p.id = mul.user_id
    WHERE mul.manager_id = p_manager_id
      AND p.role = 'user'
  ),
  users_dataset AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'user_id', p.id,
          'username', p.username,
          'full_name', p.full_name,
          'is_active', p.is_active,
          'created_at', p.created_at,
          'available_balance', COALESCE(bal.available, 0),
          'in_play_balance', COALESCE(bal.in_play, 0),
          'period_turnover', COALESCE((
            SELECT SUM(b.stake)
            FROM bets b
            WHERE b.user_id = p.id
              AND (p_started_at IS NULL OR b.placed_at >= p_started_at)
              AND (p_ended_at IS NULL OR b.placed_at <= p_ended_at)
          ), 0),
          'period_pnl', COALESCE((
            SELECT SUM(
              CASE
                WHEN b.status = 'won' THEN b.potential_payout - b.stake
                WHEN b.status = 'lost' THEN -b.stake
                ELSE 0
              END
            )
            FROM bets b
            WHERE b.user_id = p.id
              AND b.settled_at IS NOT NULL
              AND (p_started_at IS NULL OR b.settled_at >= p_started_at)
              AND (p_ended_at IS NULL OR b.settled_at <= p_ended_at)
          ), 0),
          'open_exposure', COALESCE((
            SELECT SUM(b.stake)
            FROM bets b
            WHERE b.user_id = p.id
              AND b.status = 'open'
              AND (p_started_at IS NULL OR b.placed_at >= p_started_at)
              AND (p_ended_at IS NULL OR b.placed_at <= p_ended_at)
          ), 0)
        )
        ORDER BY p.created_at, p.id
      ),
      '[]'::jsonb
    ) AS rows
    FROM manager_user_links mul
    JOIN profiles p ON p.id = mul.user_id
    LEFT JOIN balances bal ON bal.user_id = p.id
    WHERE mul.manager_id = p_manager_id
      AND p.role = 'user'
  ),
  transactions_dataset AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'transaction_id', bt.id,
          'created_at', bt.created_at,
          'type', bt.type,
          'amount', bt.amount,
          'balance_after', bt.balance_after,
          'note', bt.note,
          'bet_id', bt.bet_id,
          'user_id', bt.user_id,
          'user_username', up.username,
          'initiated_by', bt.initiated_by,
          'initiator_username', ip.username,
          'initiator_role', ip.role
        )
        ORDER BY bt.created_at, bt.id
      ),
      '[]'::jsonb
    ) AS rows
    FROM balance_transactions bt
    JOIN profiles up ON up.id = bt.user_id
    JOIN profiles ip ON ip.id = bt.initiated_by
    WHERE (
      bt.user_id IN (SELECT id FROM managed_user_ids)
      OR bt.initiated_by = p_manager_id
    )
      AND (p_started_at IS NULL OR bt.created_at >= p_started_at)
      AND (p_ended_at IS NULL OR bt.created_at <= p_ended_at)
  ),
  action_log_dataset AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'action_log_id', al.id,
          'created_at', al.created_at,
          'action', al.action,
          'target_id', al.target_id,
          'target_username', tp.username,
          'target_full_name', tp.full_name,
          'initiated_by', al.initiated_by,
          'initiator_username', ip.username,
          'initiator_role', ip.role
        )
        ORDER BY al.created_at, al.id
      ),
      '[]'::jsonb
    ) AS rows
    FROM admin_action_logs al
    JOIN profiles tp ON tp.id = al.target_id
    JOIN profiles ip ON ip.id = al.initiated_by
    WHERE (
      al.target_id = p_manager_id
      OR al.target_id IN (SELECT id FROM managed_user_ids)
      OR al.initiated_by = p_manager_id
    )
      AND (p_started_at IS NULL OR al.created_at >= p_started_at)
      AND (p_ended_at IS NULL OR al.created_at <= p_ended_at)
  )
  SELECT jsonb_build_object(
    'manager', COALESCE((SELECT to_jsonb(manager_profile) FROM manager_profile), '{}'::jsonb),
    'summary', jsonb_build_object(
      'managed_user_count', COALESCE((SELECT COUNT(*) FROM managed_user_ids), 0),
      'period_turnover', COALESCE((
        SELECT SUM(b.stake)
        FROM bets b
        WHERE b.user_id IN (SELECT id FROM managed_user_ids)
          AND (p_started_at IS NULL OR b.placed_at >= p_started_at)
          AND (p_ended_at IS NULL OR b.placed_at <= p_ended_at)
      ), 0),
      'period_pnl', COALESCE((
        SELECT SUM(
          CASE
            WHEN b.status = 'won' THEN b.potential_payout - b.stake
            WHEN b.status = 'lost' THEN -b.stake
            ELSE 0
          END
        )
        FROM bets b
        WHERE b.user_id IN (SELECT id FROM managed_user_ids)
          AND b.settled_at IS NOT NULL
          AND (p_started_at IS NULL OR b.settled_at >= p_started_at)
          AND (p_ended_at IS NULL OR b.settled_at <= p_ended_at)
      ), 0),
      'open_exposure', COALESCE((
        SELECT SUM(b.stake)
        FROM bets b
        WHERE b.user_id IN (SELECT id FROM managed_user_ids)
          AND b.status = 'open'
          AND (p_started_at IS NULL OR b.placed_at >= p_started_at)
          AND (p_ended_at IS NULL OR b.placed_at <= p_ended_at)
      ), 0)
    ),
    'users', (SELECT rows FROM users_dataset),
    'transactions', (SELECT rows FROM transactions_dataset),
    'action_log', (SELECT rows FROM action_log_dataset)
  );
$$;

CREATE OR REPLACE FUNCTION admin_build_user_statement_report_dataset(
  p_started_at timestamptz DEFAULT NULL,
  p_ended_at timestamptz DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH _guard AS (
    SELECT admin_require_super_admin()
  ),
  user_profile AS (
    SELECT
      p.id,
      p.username,
      p.full_name,
      p.is_active,
      p.created_at,
      COALESCE(bal.available, 0) AS available_balance,
      COALESCE(bal.in_play, 0) AS in_play_balance
    FROM profiles p
    LEFT JOIN balances bal ON bal.user_id = p.id
    WHERE p.id = p_user_id
      AND p.role = 'user'
  ),
  manager_links AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'manager_id', m.id,
          'username', m.username,
          'full_name', m.full_name,
          'is_active', m.is_active,
          'created_at', m.created_at
        )
        ORDER BY m.created_at, m.id
      ),
      '[]'::jsonb
    ) AS rows
    FROM manager_user_links mul
    JOIN profiles m ON m.id = mul.manager_id
    WHERE mul.user_id = p_user_id
      AND m.role = 'manager'
  ),
  bets_history AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'bet_id', b.id,
          'placed_at', b.placed_at,
          'settled_at', b.settled_at,
          'status', b.status,
          'stake', b.stake,
          'locked_odds', b.locked_odds,
          'potential_payout', b.potential_payout,
          'market_id', mk.id,
          'market_question', mk.question,
          'market_status', mk.status,
          'outcome_id', mo.id,
          'outcome_name', mo.name
        )
        ORDER BY b.placed_at, b.id
      ),
      '[]'::jsonb
    ) AS rows
    FROM bets b
    JOIN markets mk ON mk.id = b.market_id
    JOIN market_outcomes mo ON mo.id = b.outcome_id
    WHERE b.user_id = p_user_id
      AND (p_started_at IS NULL OR b.placed_at >= p_started_at)
      AND (p_ended_at IS NULL OR b.placed_at <= p_ended_at)
  ),
  transactions_dataset AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'transaction_id', bt.id,
          'created_at', bt.created_at,
          'type', bt.type,
          'amount', bt.amount,
          'balance_after', bt.balance_after,
          'note', bt.note,
          'bet_id', bt.bet_id,
          'initiated_by', bt.initiated_by,
          'initiator_username', ip.username,
          'initiator_role', ip.role
        )
        ORDER BY bt.created_at, bt.id
      ),
      '[]'::jsonb
    ) AS rows
    FROM balance_transactions bt
    JOIN profiles ip ON ip.id = bt.initiated_by
    WHERE bt.user_id = p_user_id
      AND (p_started_at IS NULL OR bt.created_at >= p_started_at)
      AND (p_ended_at IS NULL OR bt.created_at <= p_ended_at)
  )
  SELECT jsonb_build_object(
    'user', COALESCE((SELECT to_jsonb(user_profile) FROM user_profile), '{}'::jsonb),
    'managers', (SELECT rows FROM manager_links),
    'period_totals', jsonb_build_object(
      'total_stake', COALESCE((
        SELECT SUM(b.stake)
        FROM bets b
        WHERE b.user_id = p_user_id
          AND (p_started_at IS NULL OR b.placed_at >= p_started_at)
          AND (p_ended_at IS NULL OR b.placed_at <= p_ended_at)
      ), 0),
      'total_potential_payout', COALESCE((
        SELECT SUM(b.potential_payout)
        FROM bets b
        WHERE b.user_id = p_user_id
          AND (p_started_at IS NULL OR b.placed_at >= p_started_at)
          AND (p_ended_at IS NULL OR b.placed_at <= p_ended_at)
      ), 0),
      'settled_pnl', COALESCE((
        SELECT SUM(
          CASE
            WHEN b.status = 'won' THEN b.potential_payout - b.stake
            WHEN b.status = 'lost' THEN -b.stake
            ELSE 0
          END
        )
        FROM bets b
        WHERE b.user_id = p_user_id
          AND b.settled_at IS NOT NULL
          AND (p_started_at IS NULL OR b.settled_at >= p_started_at)
          AND (p_ended_at IS NULL OR b.settled_at <= p_ended_at)
      ), 0),
      'net_transactions', COALESCE((
        SELECT SUM(bt.amount)
        FROM balance_transactions bt
        WHERE bt.user_id = p_user_id
          AND (p_started_at IS NULL OR bt.created_at >= p_started_at)
          AND (p_ended_at IS NULL OR bt.created_at <= p_ended_at)
      ), 0)
    ),
    'bets_history', (SELECT rows FROM bets_history),
    'transactions', (SELECT rows FROM transactions_dataset)
  );
$$;

CREATE OR REPLACE FUNCTION admin_build_audit_actions_report_dataset(
  p_started_at timestamptz DEFAULT NULL,
  p_ended_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH _guard AS (
    SELECT admin_require_super_admin()
  ),
  financial_events AS (
    SELECT
      bt.id AS entry_id,
      bt.created_at AS event_at,
      jsonb_build_object(
        'entry_id', bt.id,
        'event_at', bt.created_at,
        'source', 'balance_transactions',
        'action', bt.type,
        'amount', bt.amount,
        'note', bt.note,
        'target_id', bt.user_id,
        'target_username', tp.username,
        'target_full_name', tp.full_name,
        'actor_id', bt.initiated_by,
        'actor_username', ap.username,
        'actor_full_name', ap.full_name,
        'actor_role', ap.role
      ) AS row_payload
    FROM balance_transactions bt
    JOIN profiles tp ON tp.id = bt.user_id
    JOIN profiles ap ON ap.id = bt.initiated_by
    WHERE bt.type IN ('adjustment', 'transfer')
      AND (p_started_at IS NULL OR bt.created_at >= p_started_at)
      AND (p_ended_at IS NULL OR bt.created_at <= p_ended_at)
    ORDER BY bt.created_at, bt.id
  ),
  action_events AS (
    SELECT
      al.id AS entry_id,
      al.created_at AS event_at,
      jsonb_build_object(
        'entry_id', al.id,
        'event_at', al.created_at,
        'source', 'admin_action_logs',
        'action', al.action,
        'amount', NULL,
        'note', NULL,
        'target_id', al.target_id,
        'target_username', tp.username,
        'target_full_name', tp.full_name,
        'actor_id', al.initiated_by,
        'actor_username', ap.username,
        'actor_full_name', ap.full_name,
        'actor_role', ap.role
      ) AS row_payload
    FROM admin_action_logs al
    JOIN profiles tp ON tp.id = al.target_id
    JOIN profiles ap ON ap.id = al.initiated_by
    WHERE (p_started_at IS NULL OR al.created_at >= p_started_at)
      AND (p_ended_at IS NULL OR al.created_at <= p_ended_at)
    ORDER BY al.created_at, al.id
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'financial_event_count', COALESCE((SELECT COUNT(*) FROM financial_events), 0),
      'action_event_count', COALESCE((SELECT COUNT(*) FROM action_events), 0),
      'total_event_count', COALESCE((SELECT COUNT(*) FROM financial_events), 0) + COALESCE((SELECT COUNT(*) FROM action_events), 0)
    ),
    'rows', COALESCE((
      SELECT jsonb_agg(row_payload ORDER BY event_at, source_rank, entry_id)
      FROM (
        SELECT entry_id, event_at, 1 AS source_rank, row_payload FROM financial_events
        UNION ALL
        SELECT entry_id, event_at, 2 AS source_rank, row_payload FROM action_events
      ) combined
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION admin_get_report_dataset(
  p_report_type text,
  p_started_at timestamptz DEFAULT NULL,
  p_ended_at timestamptz DEFAULT NULL,
  p_manager_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started_at timestamptz := p_started_at;
  v_ended_at timestamptz := p_ended_at;
  v_dataset jsonb := '{}'::jsonb;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  IF v_started_at IS NOT NULL
     AND v_ended_at IS NOT NULL
     AND v_started_at > v_ended_at THEN
    RAISE EXCEPTION 'Invalid report range: started_at must be before ended_at';
  END IF;

  CASE p_report_type
    WHEN 'system_summary' THEN
      v_dataset := admin_build_system_summary_report_dataset(v_started_at, v_ended_at);
    WHEN 'managers_performance' THEN
      v_dataset := admin_build_managers_performance_report_dataset(v_started_at, v_ended_at);
    WHEN 'manager_detailed' THEN
      IF p_manager_id IS NULL THEN
        RAISE EXCEPTION 'manager_id is required for manager_detailed';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.id = p_manager_id
          AND p.role = 'manager'
      ) THEN
        RAISE EXCEPTION 'Manager not found';
      END IF;

      v_dataset := admin_build_manager_detailed_report_dataset(v_started_at, v_ended_at, p_manager_id);
    WHEN 'user_statement' THEN
      IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required for user_statement';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.id = p_user_id
          AND p.role = 'user'
      ) THEN
        RAISE EXCEPTION 'User not found';
      END IF;

      v_dataset := admin_build_user_statement_report_dataset(v_started_at, v_ended_at, p_user_id);
    WHEN 'audit_actions' THEN
      v_dataset := admin_build_audit_actions_report_dataset(v_started_at, v_ended_at);
    ELSE
      RAISE EXCEPTION 'Unsupported report_type: %', p_report_type;
  END CASE;

  RETURN jsonb_build_object(
    'report_type', p_report_type,
    'generated_at', now(),
    'filters', jsonb_build_object(
      'started_at', v_started_at,
      'ended_at', v_ended_at,
      'manager_id', p_manager_id,
      'user_id', p_user_id
    ),
    'data', v_dataset
  );
END;
$$;
