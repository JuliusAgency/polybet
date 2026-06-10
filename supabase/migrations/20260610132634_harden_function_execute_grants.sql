-- SECURITY (audit 2026-06-10): close the unauthenticated / over-broad EXECUTE
-- surface on privileged SECURITY DEFINER functions.
--
-- Root cause: Postgres grants EXECUTE to PUBLIC (which anon + authenticated
-- inherit) on every new function. Several settlement / lifecycle functions
-- gate access with `IF auth.uid() IS NOT NULL THEN <super_admin check> END IF`,
-- which is SKIPPED when auth.uid() is NULL. An unauthenticated PostgREST call
-- (apikey: <anon_key>, no Authorization header) lands in the DB session with
-- auth.uid() = NULL, so the gate is bypassed entirely. Verified live:
--   settle_market / settle_pending_bets / close_expired_markets
--   were all EXECUTE-able by anon AND authenticated.
--
-- These functions are only ever invoked by the service role (settle-markets
-- edge fn uses the service-role key; close-expired runs from pg_cron as the
-- postgres superuser). Revoking PUBLIC/anon/authenticated EXECUTE is the real
-- gate: cron (postgres) and the service role bypass EXECUTE restrictions.
--
-- cascade_event_lifecycle() was already revoked in migration 072 and is left
-- as-is.

-- 1. Settlement RPCs — unauthenticated financial-manipulation vector (CRITICAL).
REVOKE ALL ON FUNCTION settle_market(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_market(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION settle_pending_bets(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_pending_bets(int) TO service_role;

-- 2. Market lifecycle — anyone could force-close expired markets (HIGH).
REVOKE ALL ON FUNCTION close_expired_markets() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION close_expired_markets() TO service_role;

-- 3. Price oracle — no legitimate unauthenticated use; the BetSlip is authed.
--    Revoke from PUBLIC (anon inherits EXECUTE through PUBLIC, so revoking anon
--    alone is not enough) and anon. authenticated + service_role keep their
--    explicit grants from 20260525143439.
REVOKE EXECUTE ON FUNCTION quote_bet_payout(text, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION quote_bet_payout(text, numeric) TO authenticated, service_role;

-- 4. Report builders left exposed to `authenticated` (same dead `_guard` CTE
--    problem fixed for the other builders in 20260610123702). The only
--    legitimate entry point is the dispatcher admin_get_report_dataset
--    (LANGUAGE plpgsql, live is_super_admin() gate), which runs as owner and
--    keeps working after these REVOKEs.
REVOKE ALL ON FUNCTION admin_build_managers_performance_report_dataset(timestamptz, timestamptz)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION admin_build_manager_detailed_report_dataset(timestamptz, timestamptz, uuid)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION admin_build_user_statement_report_dataset(timestamptz, timestamptz, uuid)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION admin_build_audit_actions_report_dataset(timestamptz, timestamptz)
  FROM public, anon, authenticated;
