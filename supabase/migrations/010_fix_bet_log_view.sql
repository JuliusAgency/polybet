-- Migration 010: Fix admin_bet_log view to prevent duplicate rows
-- A user could theoretically be linked to multiple managers;
-- DISTINCT ON (b.id) ensures exactly one row per bet.

CREATE OR REPLACE VIEW admin_bet_log
  WITH (security_invoker = on)
AS
SELECT DISTINCT ON (b.id)
  b.id,
  b.placed_at,
  b.settled_at,
  b.stake,
  b.locked_odds,
  b.potential_payout,
  b.status,
  b.user_id,
  up.username       AS user_username,
  up.full_name      AS user_full_name,
  mul.manager_id,
  mp.username       AS manager_username,
  mp.full_name      AS manager_full_name,
  m.id              AS market_id,
  m.question        AS market_description,
  m.polymarket_slug,
  mo.name           AS outcome_name
FROM bets b
JOIN profiles up ON up.id = b.user_id
JOIN markets m ON m.id = b.market_id
JOIN market_outcomes mo ON mo.id = b.outcome_id
LEFT JOIN manager_user_links mul ON mul.user_id = b.user_id
LEFT JOIN profiles mp ON mp.id = mul.manager_id
ORDER BY b.id, b.placed_at DESC;
