-- Fix two CRITICAL "Security Definer View" advisories.
--
-- Both views ran as SECURITY DEFINER (the Postgres default for views), which
-- bypasses the RLS of the underlying tables and enforces the view owner's
-- privileges instead of the querying user's. Combined with the default
-- PostgREST grants this leaked house-wide / per-manager financials:
--
--   * system_kpis           -- readable by every authenticated user (house P/L,
--                              total points, exposure, payouts).
--   * manager_group_metrics -- readable by anon AND authenticated; exposed every
--                              manager's exposure / pnl / turnover (IDOR — the
--                              client-side .eq('manager_id', ...) filter is not a
--                              security boundary).
--
-- Switching both to security_invoker = on makes the underlying RLS apply to the
-- caller. The existing policies already produce the correct result:
--   - super_admin (is_super_admin()) reads all rows  -> dashboards stay correct
--   - manager reads only own links / linked users     -> sees only own group
--   - regular user reads only own rows                -> no house secrets
--   - anon reads nothing
--
-- Only the view option changes (no column changes), so ALTER VIEW is safe and
-- avoids the 42P16 "cannot change name of view column" trap.

ALTER VIEW public.system_kpis SET (security_invoker = on);
ALTER VIEW public.manager_group_metrics SET (security_invoker = on);

-- Defense in depth: anon must never read manager financials. (system_kpis
-- already revoked anon in migration 20260602131311; RLS now blocks anon on both
-- regardless, but keep the explicit revoke as a belt-and-suspenders grant.)
REVOKE SELECT ON public.manager_group_metrics FROM anon;
