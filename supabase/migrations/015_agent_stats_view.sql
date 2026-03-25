-- Migration 015: Agent stats RPC for AgentsDashboardPage
CREATE OR REPLACE FUNCTION get_agent_stats(
  p_month integer DEFAULT NULL,
  p_year  integer DEFAULT NULL
)
RETURNS TABLE (
  agent_id                uuid,
  username                text,
  full_name               text,
  is_active               boolean,
  monthly_deposits        numeric,
  monthly_withdrawals     numeric,
  current_system_balance  numeric,
  monthly_pnl             numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id                                               AS agent_id,
    p.username                                         AS username,
    p.full_name                                        AS full_name,
    p.is_active                                        AS is_active,
    COALESCE(SUM(CASE
      WHEN bt.type = 'adjustment'
        AND (p_month IS NULL OR EXTRACT(MONTH FROM bt.created_at) = p_month)
        AND (p_year  IS NULL OR EXTRACT(YEAR  FROM bt.created_at) = p_year)
      THEN bt.amount ELSE 0 END), 0)                  AS monthly_deposits,
    COALESCE(SUM(CASE
      WHEN bt.type = 'transfer'
        AND (p_month IS NULL OR EXTRACT(MONTH FROM bt.created_at) = p_month)
        AND (p_year  IS NULL OR EXTRACT(YEAR  FROM bt.created_at) = p_year)
      THEN ABS(bt.amount) ELSE 0 END), 0)             AS monthly_withdrawals,
    COALESCE((
      SELECT SUM(b.available + b.in_play)
      FROM manager_user_links mul
      JOIN balances b ON b.user_id = mul.user_id
      WHERE mul.manager_id = p.id
    ), 0)                                              AS current_system_balance,
    COALESCE(SUM(CASE
      WHEN bt.type IN ('adjustment', 'transfer')
        AND (p_month IS NULL OR EXTRACT(MONTH FROM bt.created_at) = p_month)
        AND (p_year  IS NULL OR EXTRACT(YEAR  FROM bt.created_at) = p_year)
      THEN bt.amount
      ELSE 0 END), 0)                                 AS monthly_pnl
  FROM profiles p
  JOIN managers m ON m.id = p.id
  LEFT JOIN balance_transactions bt ON bt.initiated_by = p.id
  WHERE p.role = 'manager'
    AND is_super_admin()
  GROUP BY p.id, p.username, p.full_name, p.is_active;
$$;
