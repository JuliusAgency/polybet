-- QA 2026-05-25 (Bugs 6 & 7): enforce a 0.01 minimum amount and a 100-char note
-- limit on all three balance-adjustment RPCs (defense-in-depth behind client
-- validation). Previously each only checked amount > 0 and the note was an
-- unbounded text, so sub-cent amounts (e.g. 0.001) and over-long notes reached
-- the ledger. These guards replace the old positive-amount check.

-- admin_adjust_balance (super-admin → user) — original in 002_admin_rpc.sql
CREATE OR REPLACE FUNCTION admin_adjust_balance(
  p_target_user_id uuid,
  p_amount         numeric,
  p_type           text,
  p_note           text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance numeric;
  v_tx_type     text;
  v_tx_amount   numeric;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  IF p_type NOT IN ('deposit', 'withdrawal') THEN
    RAISE EXCEPTION 'Invalid type: must be deposit or withdrawal';
  END IF;

  IF p_amount < 0.01 THEN
    RAISE EXCEPTION 'Minimum amount is 0.01';
  END IF;

  IF p_note IS NOT NULL AND char_length(p_note) > 100 THEN
    RAISE EXCEPTION 'Note cannot be longer than 100 characters';
  END IF;

  IF p_type = 'deposit' THEN
    UPDATE balances
    SET available = available + p_amount,
        updated_at = now()
    WHERE user_id = p_target_user_id
    RETURNING available INTO v_new_balance;

    v_tx_type   := 'adjustment';
    v_tx_amount := p_amount;

  ELSE -- withdrawal
    SELECT available INTO v_new_balance
    FROM balances
    WHERE user_id = p_target_user_id;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Balance record not found for user';
    END IF;

    IF v_new_balance < p_amount THEN
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

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Balance record not found for user';
  END IF;

  INSERT INTO balance_transactions (
    user_id, initiated_by, type, amount, balance_after, note
  ) VALUES (
    p_target_user_id, auth.uid(), v_tx_type, v_tx_amount, v_new_balance, p_note
  );
END;
$$;

-- admin_adjust_manager_balance (super-admin → manager) — original in 006
CREATE OR REPLACE FUNCTION admin_adjust_manager_balance(
  p_manager_id uuid,
  p_amount     numeric,
  p_type       text,
  p_note       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  IF p_type NOT IN ('deposit', 'withdrawal') THEN
    RAISE EXCEPTION 'Invalid type: must be deposit or withdrawal';
  END IF;

  IF p_amount < 0.01 THEN
    RAISE EXCEPTION 'Minimum amount is 0.01';
  END IF;

  IF p_note IS NOT NULL AND char_length(p_note) > 100 THEN
    RAISE EXCEPTION 'Note cannot be longer than 100 characters';
  END IF;

  IF p_type = 'deposit' THEN
    UPDATE managers
    SET balance = balance + p_amount
    WHERE id = p_manager_id
    RETURNING balance INTO v_new_balance;
  ELSE
    SELECT balance INTO v_new_balance
    FROM managers
    WHERE id = p_manager_id;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Manager not found';
    END IF;

    IF v_new_balance < p_amount THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    UPDATE managers
    SET balance = balance - p_amount
    WHERE id = p_manager_id
    RETURNING balance INTO v_new_balance;
  END IF;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Manager not found';
  END IF;

  INSERT INTO balance_transactions (
    user_id, initiated_by, type, amount, balance_after, note
  ) VALUES (
    p_manager_id,
    auth.uid(),
    CASE WHEN p_type = 'deposit' THEN 'adjustment' ELSE 'transfer' END,
    CASE WHEN p_type = 'deposit' THEN p_amount ELSE -p_amount END,
    v_new_balance,
    p_note
  );
END;
$$;

-- manager_adjust_balance (manager → linked user) — original in 008
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
  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_caller_role <> 'manager' THEN
    RAISE EXCEPTION 'Access denied: manager required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM manager_user_links
    WHERE manager_id = auth.uid() AND user_id = p_target_user_id
  ) INTO v_linked;

  IF NOT v_linked THEN
    RAISE EXCEPTION 'User is not linked to this manager';
  END IF;

  IF p_type NOT IN ('deposit', 'withdrawal') THEN
    RAISE EXCEPTION 'Invalid type: must be deposit or withdrawal';
  END IF;

  IF p_amount < 0.01 THEN
    RAISE EXCEPTION 'Minimum amount is 0.01';
  END IF;

  IF p_note IS NOT NULL AND char_length(p_note) > 100 THEN
    RAISE EXCEPTION 'Note cannot be longer than 100 characters';
  END IF;

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

  INSERT INTO balance_transactions (user_id, initiated_by, type, amount, balance_after, note)
  VALUES (p_target_user_id, auth.uid(), v_tx_type, v_tx_amount, v_new_balance, p_note);
END;
$$;
