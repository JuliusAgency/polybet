-- SECURITY (review 2026-06-10): revoke direct `authenticated` EXECUTE on the
-- admin report builder functions.
--
-- These builders are SECURITY DEFINER and rely on a
-- `WITH _guard AS (SELECT admin_require_super_admin())` CTE as their access
-- gate. That guard is DEAD CODE: Postgres elides unreferenced CTEs in
-- LANGUAGE sql functions, so the guard never executes. Earlier migrations only
-- revoked from `public, anon`, leaving `authenticated` with EXECUTE — any
-- logged-in user (role user/manager) could call them directly via PostgREST
-- (POST /rest/v1/rpc/<fn>) and read all managers'/system financial data.
--
-- The only legitimate entry point is the dispatcher admin_get_report_dataset
-- (LANGUAGE plpgsql, SECURITY DEFINER, live `IF NOT is_super_admin()` gate).
-- It runs as the function owner, so it keeps working after these REVOKEs and
-- intentionally stays executable by `authenticated` — its in-function check is
-- the access control. The REVOKE is the real gate against direct PostgREST
-- calls. (admin_build_managers_report_dataset was already revoked the same way
-- in 20260610115136 — not repeated here.)

REVOKE ALL ON FUNCTION admin_build_managers_log_dataset(timestamptz, timestamptz)
  FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION admin_build_system_summary_report_dataset(timestamptz, timestamptz)
  FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION admin_build_bets_log_dataset(timestamptz, timestamptz)
  FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION admin_build_system_dashboard_dataset(timestamptz, timestamptz)
  FROM public, anon, authenticated;
