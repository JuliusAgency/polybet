-- Migration: admin_bet_log surfaces sells too (buy + sell with a `side` column)
--
-- 20260602131448 repointed admin_bet_log onto trades but filtered to side='buy'
-- to preserve the legacy column contract during cutover. Now that the Global
-- Bet Log is updated to render a Side column, expose ALL fills (buy + sell)
-- and append `side` + `realized_pnl`. Existing columns are unchanged so the
-- CREATE OR REPLACE is a clean superset; new columns go at the end.
--
-- status keeps the closed→open mapping so it stays within the frontend
-- BetStatus enum (open|won|lost) the status filter uses.

CREATE OR REPLACE VIEW admin_bet_log
  WITH (security_invoker = on)
AS
SELECT DISTINCT ON (t.id)
  t.id,
  t.created_at      AS placed_at,
  p.settled_at,
  t.usd             AS stake,
  CASE WHEN t.price > 0 THEN 1 / t.price END AS locked_odds,
  t.shares          AS potential_payout,
  CASE WHEN p.status = 'closed' THEN 'open' ELSE p.status END AS status,
  t.user_id,
  up.username       AS user_username,
  up.full_name      AS user_full_name,
  mul.manager_id,
  mp.username       AS manager_username,
  mp.full_name      AS manager_full_name,
  m.id              AS market_id,
  m.question        AS market_description,
  m.polymarket_slug,
  mo.name           AS outcome_name,
  t.shares,
  t.price           AS avg_price,
  -- New columns: buy/sell direction and the realized P/L crystallized by sells.
  t.side,
  t.realized_pnl
FROM trades t
JOIN positions p ON p.id = t.position_id
JOIN profiles up ON up.id = t.user_id
JOIN markets m ON m.id = t.market_id
JOIN market_outcomes mo ON mo.id = t.outcome_id
LEFT JOIN manager_user_links mul ON mul.user_id = t.user_id
LEFT JOIN profiles mp ON mp.id = mul.manager_id
ORDER BY t.id, t.created_at DESC;
