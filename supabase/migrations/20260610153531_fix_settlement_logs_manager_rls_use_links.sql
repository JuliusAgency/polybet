-- Fix manager read policies on the legacy settlement-log tables to use the
-- canonical manager↔user relationship (manager_user_links) instead of the
-- immutable profiles.created_by column.
--
-- Why: migration 017 keyed the manager policies on `u.created_by = auth.uid()`.
-- That is the ONLY place in the schema that authorizes a manager by `created_by`
-- — every other manager RLS policy / report function (006, 008, 026, 030, 031,
-- 032, and the current position_settlement_logs in 20260602131002) authorizes by
-- `manager_user_links`. `created_by` records WHO created the user and never
-- changes; `manager_user_links` records WHO currently manages the user and is
-- the row the app maintains (create-user inserts it; reassignment updates it).
--
-- Consequences of the old predicate:
--   * a user reassigned to a different manager would still expose their
--     settlement logs to the ORIGINAL creator and hide them from the CURRENT
--     manager — an authorization-correctness bug.
--   * a user created by a super_admin (created_by = super_admin, no link) is
--     handled inconsistently versus every other manager-facing surface.
--
-- These two tables belong to the FROZEN bets model (no longer written by the
-- live positions/trades path), but they are still readable history, so the read
-- authorization must be correct and consistent with the rest of the schema.

-- ─────────────────────────────────────────────────────────────────────────────
-- market_settlement_logs
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "manager can read settlement logs for their users"
  ON market_settlement_logs;

CREATE POLICY "manager can read settlement logs for their users"
  ON market_settlement_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM bets b
      JOIN manager_user_links mul ON mul.user_id = b.user_id
      JOIN profiles mp ON mp.id = mul.manager_id
      WHERE b.market_id = market_settlement_logs.market_id
        AND mul.manager_id = (select auth.uid())
        AND mp.role = 'manager'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- bet_settlement_logs
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "manager can read bet settlement logs for their users"
  ON bet_settlement_logs;

CREATE POLICY "manager can read bet settlement logs for their users"
  ON bet_settlement_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM manager_user_links mul
      JOIN profiles mp ON mp.id = mul.manager_id
      WHERE mul.user_id = bet_settlement_logs.user_id
        AND mul.manager_id = (select auth.uid())
        AND mp.role = 'manager'
    )
  );
