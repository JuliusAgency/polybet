-- Migration: repoint admin_bet_log + bets_log report onto the trades model
--
-- After cutover, new activity lands in trades, not bets. These two admin "bet
-- log" surfaces are repointed so they reflect live trading. To stay non-
-- breaking for their frontends (useBetLog does `select('*')`, the reports CSV
-- keys are fixed), the column / JSON-key contract is preserved EXACTLY — only
-- the source changes from bets to BUY trades joined to positions:
--   stake            <- t.usd      (USD spent on the fill)
--   shares           <- t.shares
--   avg_price        <- t.price
--   potential_payout <- t.shares   (deprecated mirror, = gross payout)
--   locked_odds      <- 1/t.price  (deprecated mirror)
--   status           <- positions.status
--
-- Only buy fills are surfaced here (the historical "placements log" meaning).
-- Sell fills + a proper side column are a Phase 3 redesign of the Global Bet
-- Log; nothing financial depends on this view.

-- CREATE OR REPLACE keeps the existing column list/order/types (and grants), so
-- the view contract is unchanged for PostgREST / useBetLog.
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
  -- Map 'closed' (sold-out position) -> 'open' so status stays within the
  -- frontend BetStatus enum (open|won|lost). The Phase 3 Global Bet Log
  -- redesign introduces a real side column and surfaces sells/closed.
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
  t.price           AS avg_price
FROM trades t
JOIN positions p ON p.id = t.position_id
JOIN profiles up ON up.id = t.user_id
JOIN markets m ON m.id = t.market_id
JOIN market_outcomes mo ON mo.id = t.outcome_id
LEFT JOIN manager_user_links mul ON mul.user_id = t.user_id
LEFT JOIN profiles mp ON mp.id = mul.manager_id
WHERE t.side = 'buy'
ORDER BY t.id, t.created_at DESC;

-- bets_log report: same JSON keys, sourced from buy trades.
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
            'placed_at',          t.created_at,
            'user_username',      up.username,
            'manager_username',   (
              SELECT mp.username
              FROM manager_user_links mul
              JOIN profiles mp ON mp.id = mul.manager_id
              WHERE mul.user_id = t.user_id
              ORDER BY mul.manager_id
              LIMIT 1
            ),
            'market_description', mk.question,
            'stake',              t.usd,
            'locked_odds',        CASE WHEN t.price > 0 THEN 1 / t.price END,
            'potential_payout',   t.shares,
            'status',             p.status
          )
          ORDER BY t.created_at, t.id
        )
        FROM trades t
        JOIN positions p ON p.id = t.position_id
        JOIN markets  mk ON mk.id = t.market_id
        JOIN profiles up ON up.id = t.user_id
        WHERE t.side = 'buy'
          AND (p_started_at IS NULL OR t.created_at >= p_started_at)
          AND (p_ended_at   IS NULL OR t.created_at <= p_ended_at)
      ),
      '[]'::jsonb
    )
  );
$$;

-- Super-admin-only report builder (guarded by admin_require_super_admin()).
-- Only the SECURITY DEFINER dispatcher admin_get_report_dataset calls it (as
-- postgres), so revoke the default PUBLIC + anon execute entirely.
REVOKE ALL ON FUNCTION admin_build_bets_log_dataset(timestamptz, timestamptz) FROM public, anon;
