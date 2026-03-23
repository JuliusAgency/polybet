-- RLS Policies for PolyBet
-- Apply AFTER running 001_initial_schema.sql

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_user_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: is current user a super_admin?
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean AS $$
  SELECT get_my_role() = 'super_admin'
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: is current user a manager?
CREATE OR REPLACE FUNCTION is_manager()
RETURNS boolean AS $$
  SELECT get_my_role() = 'manager'
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- profiles policies
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Super admin sees all profiles" ON profiles
  FOR SELECT USING (is_super_admin());

CREATE POLICY "Manager sees own users" ON profiles
  FOR SELECT USING (
    is_manager() AND EXISTS (
      SELECT 1 FROM manager_user_links
      WHERE manager_id = auth.uid() AND user_id = profiles.id
    )
  );

CREATE POLICY "Super admin can insert profiles" ON profiles
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "Manager can insert user profiles" ON profiles
  FOR INSERT WITH CHECK (
    is_manager() AND (NEW.role = 'user')
  );

CREATE POLICY "Super admin can update profiles" ON profiles
  FOR UPDATE USING (is_super_admin());

-- markets policies (all authenticated users can read)
CREATE POLICY "All authenticated users can read markets" ON markets
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Super admin can manage markets" ON markets
  FOR ALL USING (is_super_admin());

-- market_outcomes policies
CREATE POLICY "All authenticated users can read market outcomes" ON market_outcomes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Super admin can manage market outcomes" ON market_outcomes
  FOR ALL USING (is_super_admin());

-- balances policies
CREATE POLICY "User can view own balance" ON balances
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Manager can view own users balances" ON balances
  FOR SELECT USING (
    is_manager() AND EXISTS (
      SELECT 1 FROM manager_user_links
      WHERE manager_id = auth.uid() AND user_id = balances.user_id
    )
  );

CREATE POLICY "Super admin can view all balances" ON balances
  FOR SELECT USING (is_super_admin());

-- NO direct UPDATE/INSERT on balances from client — only through RPC

-- bets policies
CREATE POLICY "User can view own bets" ON bets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Manager can view own users bets" ON bets
  FOR SELECT USING (
    is_manager() AND EXISTS (
      SELECT 1 FROM manager_user_links
      WHERE manager_id = auth.uid() AND user_id = bets.user_id
    )
  );

CREATE POLICY "Super admin can view all bets" ON bets
  FOR SELECT USING (is_super_admin());

-- balance_transactions: IMMUTABLE — no UPDATE or DELETE ever
CREATE POLICY "User can view own transactions" ON balance_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Manager can view own users transactions" ON balance_transactions
  FOR SELECT USING (
    is_manager() AND EXISTS (
      SELECT 1 FROM manager_user_links
      WHERE manager_id = auth.uid() AND user_id = balance_transactions.user_id
    )
  );

CREATE POLICY "Super admin can view all transactions" ON balance_transactions
  FOR SELECT USING (is_super_admin());

-- CRITICAL: Block UPDATE and DELETE on balance_transactions forever
CREATE POLICY "No update on transactions" ON balance_transactions
  FOR UPDATE USING (false);

CREATE POLICY "No delete on transactions" ON balance_transactions
  FOR DELETE USING (false);

-- system_settings
CREATE POLICY "Super admin can manage settings" ON system_settings
  FOR ALL USING (is_super_admin());

-- sync_runs
CREATE POLICY "Super admin can view sync runs" ON sync_runs
  FOR SELECT USING (is_super_admin());

-- manager_user_links
CREATE POLICY "Manager can view own links" ON manager_user_links
  FOR SELECT USING (auth.uid() = manager_id OR is_super_admin());
