-- Repoint manager_group_metrics from the FROZEN `bets` table to the live
-- positions/trades exchange model (cutover of 2026-06-02).
--
-- Migration 027 defined this view over `bets` (b.stake / b.potential_payout /
-- b.status). After the positions/trades cutover `bets` is historical-only and
-- never written, so the manager Reports page (ReportsPage -> useManagerGroupStats)
-- showed metrics frozen at the pre-cutover state. This recreates the view on the
-- new source of truth, preserving the exact column contract
-- (manager_id, manager_username, manager_full_name, group_open_exposure,
--  group_pnl, group_turnover) so the frontend type and UI are unchanged.
--
-- Metric mapping (mirrors system_kpis from 20260602131311 at the per-group level
-- so the two views reconcile):
--
--   group_open_exposure  House liability on the group's OPEN positions:
--                         shares (gross $1/share payout if all win) minus the
--                         cost_basis already locked. Mirrors the old
--                         GREATEST(potential_payout - stake, 0) and
--                         system_kpis.open_exposure.
--
--   group_pnl            House SETTLEMENT P/L on the group's settled positions:
--                         won  -> shares*avg_price - shares (house pays out, loss)
--                         lost -> shares*avg_price         (house keeps the stake)
--                         cost_basis is zeroed at settle, so shares*avg_price
--                         reconstructs the original stake. Mirrors the old
--                         (won: stake-payout / lost: stake) and
--                         system_kpis.system_profit. Sell / early-exit P/L is
--                         intentionally NOT folded in (it lives in
--                         positions.realized_pnl) so this stays consistent with
--                         system_kpis and the settlement identity holds.
--
--   group_turnover       Total capital the group ever staked = sum of BUY-side
--                         trade volume from the immutable ledger. Preserves the
--                         old SUM(stake) meaning (every entry of capital);
--                         sells are excluded so turnover is not double-counted.
--
-- security_invoker = on is preserved (set in 20260603104039): each correlated
-- subquery runs under the caller's RLS. positions/trades both carry the
-- "Managers read linked user ..." + "Super admin reads all ..." policies, and
-- the explicit `mul.manager_id = p.id` scopes each aggregate to that one manager
-- (required for the super-admin path, which can see every link). Column set is
-- unchanged, so no 42P16 view-column trap.

CREATE OR REPLACE VIEW manager_group_metrics
WITH (security_invoker = on)
AS
SELECT
  p.id        AS manager_id,
  p.username  AS manager_username,
  p.full_name AS manager_full_name,
  -- House liability on the group's open positions.
  COALESCE((
    SELECT SUM(GREATEST(pos.shares - pos.cost_basis, 0))
    FROM positions pos
    JOIN manager_user_links mul ON mul.user_id = pos.user_id
    WHERE mul.manager_id = p.id
      AND pos.status = 'open'
  ), 0)::numeric AS group_open_exposure,
  -- House settlement P/L on the group's settled positions (won/lost only).
  COALESCE((
    SELECT SUM(CASE
      WHEN pos.status = 'won'  THEN pos.shares * pos.avg_price - pos.shares
      WHEN pos.status = 'lost' THEN pos.shares * pos.avg_price
      ELSE 0
    END)
    FROM positions pos
    JOIN manager_user_links mul ON mul.user_id = pos.user_id
    WHERE mul.manager_id = p.id
      AND pos.status IN ('won', 'lost')
  ), 0)::numeric AS group_pnl,
  -- Total amount the group ever staked = buy-side trade volume.
  COALESCE((
    SELECT SUM(t.usd)
    FROM trades t
    JOIN manager_user_links mul ON mul.user_id = t.user_id
    WHERE mul.manager_id = p.id
      AND t.side = 'buy'
  ), 0)::numeric AS group_turnover
FROM profiles p
WHERE p.role = 'manager';
