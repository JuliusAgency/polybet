-- Migration 035: Replace total_collected_from_losers with total_stakes_collected
-- (sum of ALL settled bets' stakes, not just losers) so that:
--   total_stakes_collected - total_payouts_to_winners = system_profit

CREATE OR REPLACE FUNCTION admin_build_system_dashboard_dataset(
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
    'kpis', jsonb_build_object(
      'total_system_points', COALESCE(
        (SELECT SUM(available + in_play) FROM balances), 0
      ),
      'open_exposure', COALESCE(
        (
          SELECT SUM(stake) FROM bets
          WHERE status = 'open'
            AND (p_started_at IS NULL OR placed_at >= p_started_at)
            AND (p_ended_at   IS NULL OR placed_at <= p_ended_at)
        ), 0
      ),
      'system_profit', COALESCE(
        (
          SELECT SUM(
            CASE
              WHEN status = 'won'  THEN stake - potential_payout
              WHEN status = 'lost' THEN stake
              ELSE 0
            END
          )
          FROM bets
          WHERE settled_at IS NOT NULL
            AND (p_started_at IS NULL OR settled_at >= p_started_at)
            AND (p_ended_at   IS NULL OR settled_at <= p_ended_at)
        ), 0
      ),
      'total_stakes_collected', COALESCE(
        (
          SELECT SUM(stake) FROM bets
          WHERE settled_at IS NOT NULL
            AND (p_started_at IS NULL OR settled_at >= p_started_at)
            AND (p_ended_at   IS NULL OR settled_at <= p_ended_at)
        ), 0
      ),
      'total_payouts_to_winners', COALESCE(
        (
          SELECT SUM(potential_payout) FROM bets
          WHERE status = 'won'
            AND (p_started_at IS NULL OR settled_at >= p_started_at)
            AND (p_ended_at   IS NULL OR settled_at <= p_ended_at)
        ), 0
      )
    ),
    'counts', jsonb_build_object(
      'users',    (SELECT COUNT(*) FROM profiles WHERE role = 'user'),
      'managers', (SELECT COUNT(*) FROM profiles WHERE role = 'manager'),
      'markets',  (SELECT COUNT(*) FROM markets)
    )
  );
$$;
