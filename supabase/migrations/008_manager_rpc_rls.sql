-- Migration 008: Manager RPC + RLS policies for user-facing tables

-- ============================================================
-- 1. manager_adjust_balance RPC
-- ============================================================

CREATE OR REPLACE FUNCTION manager_adjust_balance(
  p_target_user_id uuid,
  p_amount         numeric,
  p_type           text,
  p_note           text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role   text;
  v_linked        boolean;
  v_available     numeric;
  v_new_balance   numeric;
  v_tx_type       text;
  v_tx_amount     numeric;
BEGIN
  -- 1. Check caller is a manager
  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_caller_role <> 'manager' THEN
    RAISE EXCEPTION 'Access denied: manager required';
  END IF;

  -- 2. Check target user is linked to this manager
  SELECT EXISTS (
    SELECT 1 FROM manager_user_links
    WHERE manager_id = auth.uid() AND user_id = p_target_user_id
  ) INTO v_linked;

  IF NOT v_linked THEN
    RAISE EXCEPTION 'User is not linked to this manager';
  END IF;

  -- 3. Validate type and amount
  IF p_type NOT IN ('deposit', 'withdrawal') THEN
    RAISE EXCEPTION 'Invalid type: must be deposit or withdrawal';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  -- 4. Apply balance change
  IF p_type = 'deposit' THEN
    UPDATE balances
    SET available = available + p_amount,
        updated_at = now()
    WHERE user_id = p_target_user_id
    RETURNING available INTO v_new_balance;

    v_tx_type   := 'adjustment';
    v_tx_amount := p_amount;

  ELSIF p_type = 'withdrawal' THEN
    SELECT available INTO v_available
    FROM balances
    WHERE user_id = p_target_user_id;

    IF v_available < p_amount THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    UPDATE balances
    SET available = available - p_amount,
        updated_at = now()
    WHERE user_id = p_target_user_id
    RETURNING available INTO v_new_balance;

    v_tx_type   := 'transfer';
    v_tx_amount := -p_amount;
  END IF;

  -- 5. Record transaction
  INSERT INTO balance_transactions (user_id, initiated_by, type, amount, balance_after, note)
  VALUES (p_target_user_id, auth.uid(), v_tx_type, v_tx_amount, v_new_balance, p_note);
END;
$$;

-- ============================================================
-- 2. RLS policies
-- ============================================================

-- ------------------------------------------------------------
-- bets table
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Users read own bets" ON bets;
CREATE POLICY "Users read own bets" ON bets FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Managers read linked user bets" ON bets;
CREATE POLICY "Managers read linked user bets" ON bets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM manager_user_links mul
      JOIN profiles mp ON mp.id = mul.manager_id
      WHERE mul.user_id = bets.user_id
        AND mul.manager_id = auth.uid()
        AND mp.role = 'manager'
    )
  );

DROP POLICY IF EXISTS "Super admin reads all bets" ON bets;
CREATE POLICY "Super admin reads all bets" ON bets FOR SELECT
  USING (is_super_admin());

-- ------------------------------------------------------------
-- balances table
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Users read own balance" ON balances;
CREATE POLICY "Users read own balance" ON balances FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Managers read linked user balances" ON balances;
CREATE POLICY "Managers read linked user balances" ON balances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM manager_user_links
      WHERE manager_id = auth.uid() AND user_id = balances.user_id
    )
  );

-- ------------------------------------------------------------
-- markets table
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users read visible markets" ON markets;
CREATE POLICY "Authenticated users read visible markets" ON markets FOR SELECT
  USING (is_visible = true AND auth.uid() IS NOT NULL);

-- ------------------------------------------------------------
-- market_outcomes table
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users read market outcomes" ON market_outcomes;
CREATE POLICY "Authenticated users read market outcomes" ON market_outcomes FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 3. Enable realtime for bets table
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE bets;
