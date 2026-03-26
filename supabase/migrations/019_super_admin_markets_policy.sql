-- Migration 019: Super admin can read all markets regardless of visibility
-- Previously only is_visible=true markets were accessible to any authenticated user.
-- Test Lab needs super_admin to see all open markets to place demo bets.

CREATE POLICY "Super admin reads all markets"
  ON markets FOR SELECT
  USING (is_super_admin());
