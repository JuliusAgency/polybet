-- Migration 009: Admin bet log view
-- Joins bets with user profiles, manager info, market and outcome details
-- security_invoker = on ensures the caller's RLS policies apply

CREATE OR REPLACE VIEW admin_bet_log
  WITH (security_invoker = on)
AS
SELECT
  b.id,
  b.placed_at,
  b.settled_at,
  b.stake,
  b.locked_odds,
  b.potential_payout,
  b.status,
  -- User info
  b.user_id,
  up.username       AS user_username,
  up.full_name      AS user_full_name,
  -- Manager info (LEFT JOIN because user may not be linked to a manager)
  mul.manager_id,
  mp.username       AS manager_username,
  mp.full_name      AS manager_full_name,
  -- Market info
  m.id              AS market_id,
  m.question        AS market_description,
  m.polymarket_slug,
  -- Outcome info
  mo.name           AS outcome_name
FROM bets b
JOIN profiles up ON up.id = b.user_id
JOIN markets m ON m.id = b.market_id
JOIN market_outcomes mo ON mo.id = b.outcome_id
LEFT JOIN manager_user_links mul ON mul.user_id = b.user_id
LEFT JOIN profiles mp ON mp.id = mul.manager_id;
