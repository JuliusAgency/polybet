-- Correct the anon revoke on the password-reset RPCs.
--
-- The previous migration (20260610154533) ran REVOKE EXECUTE ... FROM anon,
-- which is a no-op: Postgres grants EXECUTE to PUBLIC by default, and anon
-- inherits from PUBLIC, so anon still resolved EXECUTE = true. The grant must be
-- removed from PUBLIC itself, then re-granted explicitly to the roles that
-- legitimately call these RPCs. (Same PUBLIC-inheritance gotcha handled for
-- quote_bet_payout / settle_* in 20260610132634.)
--
-- authenticated keeps EXECUTE — the frontend calls both via an authenticated
-- session and each function authorizes the caller's role internally. service_role
-- keeps EXECUTE for server-side/admin tooling. anon is fully removed.

REVOKE EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.manager_reset_password(uuid, text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manager_reset_password(uuid, text) TO authenticated, service_role;
