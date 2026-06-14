-- BUG FIX (client report 2026-06-11): the full displayed balance cannot be
-- withdrawn.
--
-- balances.available / managers.balance are unbounded numerics; trading
-- (fractional sell proceeds, payouts) accumulates fractional cents, e.g. a
-- true balance of 1199.9999987. The UI displays round(x, 2) = "1200.00", the
-- manager requests 1200, and the strict `v_available < p_amount` check raises
-- 'Insufficient balance'. Withdrawing 1199 then leaves 0.9999987 — an
-- unwithdrawable tail shown as "1.00".
--
-- Fix, applied symmetrically to all three adjustment RPCs
-- (admin_adjust_balance, admin_adjust_manager_balance, manager_adjust_balance):
-- a withdrawal request exceeding the true balance by at most 0.01 (one
-- display cent) means "withdraw everything" — deduct exactly the remaining
-- balance, landing on 0. The ledger records the ACTUAL deducted amount.
-- Requests more than 0.01 above the balance still raise 'Insufficient
-- balance', as does any withdrawal from an empty balance.
--
-- Also fixed in passing:
--   * manager_adjust_balance had no NULL check on the balance row (a NULL
--     comparison silently skipped the guard); it now raises 'Balance record
--     not found for user' like admin_adjust_balance does.
--   * the pre-clamp balance read in all three withdrawal branches now takes
--     FOR UPDATE, serializing concurrent withdrawals on the same account
--     (two racing calls could both read the same balance and double-deduct;
--     managers.balance has no CHECK >= 0 net to catch that).
--
-- NOTE: each function declares SET search_path = public. The originals in
-- 20260525142805 relied on migration 20260610132750 to pin search_path via a
-- generic ALTER loop; CREATE OR REPLACE resets that, and the loop will not
-- re-run, so the pin must be inline here.

-- admin_adjust_balance (super-admin → user) — previous in 20260525142805
CREATE OR REPLACE FUNCTION admin_adjust_balance(
  p_target_user_id uuid,
  p_amount         numeric,
  p_type           text,
  p_note           text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_full_withdraw_tolerance CONSTANT numeric := 0.01;
  v_available   numeric;
  v_deduct      numeric;
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
    SELECT available INTO v_available
    FROM balances
    WHERE user_id = p_target_user_id
    FOR UPDATE;

    IF v_available IS NULL THEN
      RAISE EXCEPTION 'Balance record not found for user';
    END IF;

    IF p_amount > v_available + c_full_withdraw_tolerance THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    -- Clamp: a request within one cent above the true balance is "withdraw
    -- everything" (the UI shows round(available, 2), which can round up).
    v_deduct := LEAST(p_amount, v_available);

    IF v_deduct <= 0 THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    UPDATE balances
    SET available = available - v_deduct,
        updated_at = now()
    WHERE user_id = p_target_user_id
    RETURNING available INTO v_new_balance;

    v_tx_type   := 'transfer';
    v_tx_amount := -v_deduct;
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

-- admin_adjust_manager_balance (super-admin → manager) — previous in 20260525142805
CREATE OR REPLACE FUNCTION admin_adjust_manager_balance(
  p_manager_id uuid,
  p_amount     numeric,
  p_type       text,
  p_note       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_full_withdraw_tolerance CONSTANT numeric := 0.01;
  v_balance     numeric;
  v_deduct      numeric;
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
    SELECT balance INTO v_balance
    FROM managers
    WHERE id = p_manager_id
    FOR UPDATE;

    IF v_balance IS NULL THEN
      RAISE EXCEPTION 'Manager not found';
    END IF;

    IF p_amount > v_balance + c_full_withdraw_tolerance THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    -- Clamp: see admin_adjust_balance above.
    v_deduct := LEAST(p_amount, v_balance);

    IF v_deduct <= 0 THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    UPDATE managers
    SET balance = balance - v_deduct
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
    CASE WHEN p_type = 'deposit' THEN p_amount ELSE -v_deduct END,
    v_new_balance,
    p_note
  );
END;
$$;

-- manager_adjust_balance (manager → linked user) — previous in 20260525142805
CREATE OR REPLACE FUNCTION manager_adjust_balance(
  p_target_user_id uuid,
  p_amount         numeric,
  p_type           text,
  p_note           text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_full_withdraw_tolerance CONSTANT numeric := 0.01;
  v_caller_role   text;
  v_linked        boolean;
  v_available     numeric;
  v_deduct        numeric;
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
    WHERE user_id = p_target_user_id
    FOR UPDATE;

    IF v_available IS NULL THEN
      RAISE EXCEPTION 'Balance record not found for user';
    END IF;

    IF p_amount > v_available + c_full_withdraw_tolerance THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    -- Clamp: see admin_adjust_balance above.
    v_deduct := LEAST(p_amount, v_available);

    IF v_deduct <= 0 THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    UPDATE balances
    SET available = available - v_deduct,
        updated_at = now()
    WHERE user_id = p_target_user_id
    RETURNING available INTO v_new_balance;

    v_tx_type   := 'transfer';
    v_tx_amount := -v_deduct;
  END IF;

  INSERT INTO balance_transactions (user_id, initiated_by, type, amount, balance_after, note)
  VALUES (p_target_user_id, auth.uid(), v_tx_type, v_tx_amount, v_new_balance, p_note);
END;
$$;
