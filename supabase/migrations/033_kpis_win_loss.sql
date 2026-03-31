-- Migration 033: Add total_payouts_to_winners and total_collected_from_losers to system_kpis
-- DROP + CREATE required because PostgreSQL forbids inserting columns mid-list via CREATE OR REPLACE VIEW.

DROP VIEW IF EXISTS system_kpis;

CREATE VIEW system_kpis AS
SELECT
  COALESCE((
    SELECT SUM(b.available + b.in_play)
    FROM balances b
  ), 0)::numeric AS total_points_in_system,
  COALESCE((
    SELECT SUM(GREATEST(bt.potential_payout - bt.stake, 0))
    FROM bets bt
    WHERE bt.status = 'open'
  ), 0)::numeric AS open_exposure,
  COALESCE((
    SELECT SUM(
      CASE
        WHEN bt.status = 'won'  THEN bt.stake - bt.potential_payout
        WHEN bt.status = 'lost' THEN bt.stake
        ELSE 0
      END
    )
    FROM bets bt
  ), 0)::numeric AS system_profit,
  COALESCE((
    SELECT SUM(bt.potential_payout)
    FROM bets bt
    WHERE bt.status = 'won'
  ), 0)::numeric AS total_payouts_to_winners,
  COALESCE((
    SELECT SUM(bt.stake)
    FROM bets bt
    WHERE bt.status = 'lost'
  ), 0)::numeric AS total_collected_from_losers,
  (SELECT COUNT(*) FROM markets WHERE status = 'open')::bigint     AS active_markets,
  (SELECT COUNT(*) FROM markets WHERE status = 'resolved')::bigint AS resolved_markets,
  (SELECT COUNT(*) FROM markets WHERE status = 'archived')::bigint AS archived_markets,
  (SELECT COUNT(*) FROM profiles WHERE role = 'manager')::bigint   AS total_managers,
  (SELECT COUNT(*) FROM profiles WHERE role = 'user')::bigint      AS total_users;
