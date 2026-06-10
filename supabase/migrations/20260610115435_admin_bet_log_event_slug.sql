-- admin_bet_log: expose the EVENT slug for the Polymarket link (QA fix 2026-06-10).
--
-- The Global Bet Log linked the Market name to
-- https://polymarket.com/event/{markets.polymarket_slug}. That column holds the
-- Gamma MARKET slug, but Polymarket serves event pages at /event/{EVENT_slug} —
-- for sub-markets of multi-market events (market slug != event slug) the link
-- 404s ("Page not found"). Single-market events only worked by accident because
-- their market slug equals the event slug.
--
-- Fix: surface events.slug as `polymarket_event_slug` so the frontend can build
-- /event/{event_slug}[/{market_slug}] (deep link when the slugs differ). LEFT
-- JOIN — markets.event_id is nullable and legacy rows must stay in the log.
--
-- CREATE OR REPLACE VIEW is append-only for columns (42P16 otherwise): the new
-- column goes LAST, after t.realized_pnl. Body otherwise identical to
-- 20260603070621_admin_bet_log_show_sells.sql; security_invoker preserved.

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
  t.side,
  t.realized_pnl,
  -- Polymarket EVENT slug — the canonical /event/ URL segment. NULL when the
  -- market is not linked to an event (frontend then renders plain text).
  e.slug            AS polymarket_event_slug
FROM trades t
JOIN positions p ON p.id = t.position_id
JOIN profiles up ON up.id = t.user_id
JOIN markets m ON m.id = t.market_id
JOIN market_outcomes mo ON mo.id = t.outcome_id
LEFT JOIN events e ON e.id = m.event_id
LEFT JOIN manager_user_links mul ON mul.user_id = t.user_id
LEFT JOIN profiles mp ON mp.id = mul.manager_id
ORDER BY t.id, t.created_at DESC;
