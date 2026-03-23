-- Migration 002: Admin RPC Functions
-- Super Admin management functions: adjust balance, toggle block, reset password

-- Helper: check if current user is super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- RPC: admin_adjust_balance
-- Atomically adjusts a user's balance and logs the transaction.
-- p_type: 'deposit' | 'withdrawal'
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
  -- Guard: caller must be super_admin
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  -- Validate p_type
  IF p_type NOT IN ('deposit', 'withdrawal') THEN
    RAISE EXCEPTION 'Invalid type: must be deposit or withdrawal';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
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
    -- Check sufficient funds
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

  -- Log transaction
  INSERT INTO balance_transactions (
    user_id,
    initiated_by,
    type,
    amount,
    balance_after,
    note
  ) VALUES (
    p_target_user_id,
    auth.uid(),
    v_tx_type,
    v_tx_amount,
    v_new_balance,
    p_note
  );
END;
$$;

-- RPC: admin_toggle_user_block
-- Toggles is_active flag for a user.
CREATE OR REPLACE FUNCTION admin_toggle_user_block(
  p_target_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  UPDATE profiles
  SET is_active = NOT is_active
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

-- RPC: admin_reset_password
-- Resets a user's password by updating the encrypted_password in auth.users.
-- Requires pgcrypto extension.
-- NOTE: Direct auth.users mutation works on local Supabase. For production, use Admin API via Edge Function.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION admin_reset_password(
  p_target_user_id uuid,
  p_new_password   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found in auth.users';
  END IF;
END;
$$;
