-- Migration 039: Enable RLS on tables missing row level security
--
-- Several tables were created without ENABLE ROW LEVEL SECURITY.
-- Some had policies defined in migrations 008/019 but RLS was never enabled,
-- making those policies dormant (present in pg_policy but never enforced).
--
-- All writes go through SECURITY DEFINER RPCs (postgres role, BYPASSRLS).
-- Only SELECT policies are required for user-facing reads.
--
-- Category A - policies already exist, RLS just needs to be enabled:
--   balances, markets, market_outcomes
--
-- Category B - need both ENABLE RLS and new SELECT policies:
--   profiles, managers, manager_user_links, balance_transactions, system_settings
--
-- Note: is_super_admin() is a STABLE SQL function that reads profiles
-- WHERE id = auth.uid(). The "Users read own profile" policy below covers
-- that exact lookup, so is_super_admin() continues to work after profiles RLS
-- is enabled.

-- ============================================================
-- CATEGORY A: Enable RLS on tables that already have policies
-- ============================================================

-- balances: policies from migration 008 cover users and managers.
-- Add missing super_admin SELECT policy before enabling RLS.
DROP POLICY IF EXISTS "Super admin reads all balances" ON balances;
CREATE POLICY "Super admin reads all balances" ON balances FOR SELECT
  USING (is_super_admin());

ALTER TABLE balances ENABLE ROW LEVEL SECURITY;

-- markets: policies from migrations 008 and 019 cover all roles.
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;

-- market_outcomes: policy from migration 008 covers authenticated users.
ALTER TABLE market_outcomes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CATEGORY B: Enable RLS and create policies for unprotected tables
-- ============================================================

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON profiles;
CREATE POLICY "Users read own profile" ON profiles FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Managers read linked user profiles" ON profiles;
CREATE POLICY "Managers read linked user profiles" ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM manager_user_links
      WHERE manager_id = auth.uid() AND user_id = profiles.id
    )
  );

DROP POLICY IF EXISTS "Super admin reads all profiles" ON profiles;
CREATE POLICY "Super admin reads all profiles" ON profiles FOR SELECT
  USING (is_super_admin());

-- ------------------------------------------------------------
-- managers
-- ------------------------------------------------------------
ALTER TABLE managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read own record" ON managers;
CREATE POLICY "Managers read own record" ON managers FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Super admin reads all managers" ON managers;
CREATE POLICY "Super admin reads all managers" ON managers FOR SELECT
  USING (is_super_admin());

-- ------------------------------------------------------------
-- manager_user_links
-- ------------------------------------------------------------
ALTER TABLE manager_user_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read own links" ON manager_user_links;
CREATE POLICY "Managers read own links" ON manager_user_links FOR SELECT
  USING (manager_id = auth.uid());

DROP POLICY IF EXISTS "Super admin reads all manager user links" ON manager_user_links;
CREATE POLICY "Super admin reads all manager user links" ON manager_user_links FOR SELECT
  USING (is_super_admin());

-- ------------------------------------------------------------
-- balance_transactions
-- Append-only ledger; UPDATE and DELETE are blocked by trigger
-- trg_prevent_balance_transactions_mutation (migration 028).
-- No UPDATE/DELETE RLS policies are needed.
-- ------------------------------------------------------------
ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own transactions" ON balance_transactions;
CREATE POLICY "Users read own transactions" ON balance_transactions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Managers read linked user transactions" ON balance_transactions;
CREATE POLICY "Managers read linked user transactions" ON balance_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM manager_user_links
      WHERE manager_id = auth.uid() AND user_id = balance_transactions.user_id
    )
  );

DROP POLICY IF EXISTS "Super admin reads all transactions" ON balance_transactions;
CREATE POLICY "Super admin reads all transactions" ON balance_transactions FOR SELECT
  USING (is_super_admin());

-- ------------------------------------------------------------
-- system_settings
-- Only super_admin reads system configuration.
-- ------------------------------------------------------------
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin reads all system settings" ON system_settings;
CREATE POLICY "Super admin reads all system settings" ON system_settings FOR SELECT
  USING (is_super_admin());
