-- ENVIRONMENT PARITY (2026-06-11): restore standard Supabase table grants.
--
-- Newer Supabase CLI images initialize the local database with restricted
-- default privileges: tables created by migrations no longer receive
-- SELECT/INSERT/UPDATE/DELETE for anon/authenticated/service_role
-- automatically (only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN remain). The
-- production database was created under the old defaults, where every table
-- gets full DML grants and row access is gated by RLS. After a fresh
-- `db reset` the local stack therefore diverges from prod: any RLS policy
-- that references another table (e.g. positions -> manager_user_links) fails
-- with "permission denied", and 20 tests-db cases break.
--
-- This migration restores prod parity explicitly (it is a no-op on prod,
-- where the grants already exist) and pins the same behaviour for tables
-- created by FUTURE migrations via ALTER DEFAULT PRIVILEGES.
--
-- Access control still happens in RLS — every public table has RLS enabled
-- (migration 039 + audit 2026-06-10). Grants are the coarse gate only.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO anon, authenticated, service_role;

-- Re-apply the DELIBERATE table/view-level revokes that the blanket grant
-- above would otherwise undo (each documented in its original migration):

-- 20260602125613: positions/trades are written ONLY via SECURITY DEFINER RPCs.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON positions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON trades FROM anon, authenticated;

-- 20260602131002: settlement logs are service-written, user-readable.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON position_settlement_logs FROM anon, authenticated;

-- 20260602131311 / 20260603104039: KPI views are for signed-in roles only.
REVOKE SELECT ON system_kpis FROM anon;
REVOKE SELECT ON public.manager_group_metrics FROM anon;
