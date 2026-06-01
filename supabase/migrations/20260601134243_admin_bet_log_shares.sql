-- Expose shares + avg_price on the admin_bet_log view so the Global Bet Log
-- can speak the shares model (price in cents, shares to win) instead of the
-- deprecated odds multiplier. Mirrors migration 010's definition verbatim and
-- only appends the two new columns. security_invoker stays on so the view
-- respects the caller's RLS (admin/super_admin gating lives on the base tables
-- / page route).

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
  mo.name           AS outcome_name,
  -- New columns MUST be appended at the end: CREATE OR REPLACE VIEW cannot
  -- reorder or rename existing view columns (SQLSTATE 42P16).
  b.shares,
  b.avg_price
FROM bets b
JOIN profiles up ON up.id = b.user_id
JOIN markets m ON m.id = b.market_id
JOIN market_outcomes mo ON mo.id = b.outcome_id
LEFT JOIN manager_user_links mul ON mul.user_id = b.user_id
LEFT JOIN profiles mp ON mp.id = mul.manager_id
ORDER BY b.id, b.placed_at DESC;
