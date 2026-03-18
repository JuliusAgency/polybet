-- Migration 006: Manager balance RPC + cascade block + realtime for profiles

-- ── 1. Add cascade_blocked_by to profiles ────────────────────────────────────
-- Marks users that were blocked as part of a manager cascade-block.
-- Used to selectively unblock them when the manager is unblocked.

ALTER TABLE profiles
  ADD COLUMN cascade_blocked_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- ── 2. Enable realtime for profiles ──────────────────────────────────────────
-- Required for client-side subscription to detect is_active changes.

ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- ── 3. RPC: admin_adjust_manager_balance ─────────────────────────────────────
-- Adjusts manager's balance (stored in managers.balance, not balances table).
-- Logs the transaction to balance_transactions for the global financial log.

CREATE OR REPLACE FUNCTION admin_adjust_manager_balance(
  p_manager_id uuid,
  p_amount     numeric,
  p_type       text,     -- 'deposit' | 'withdrawal'
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

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF p_type = 'deposit' THEN
    UPDATE managers
    SET balance = balance + p_amount
    WHERE id = p_manager_id
    RETURNING balance INTO v_new_balance;
  ELSE
    -- Check sufficient funds
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

  -- Log to balance_transactions for the global financial log
  INSERT INTO balance_transactions (
    user_id,
    initiated_by,
    type,
    amount,
    balance_after,
    note
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

-- ── 4. Update admin_toggle_user_block with cascade logic ─────────────────────

CREATE OR REPLACE FUNCTION admin_toggle_user_block(p_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_state boolean;
  v_role      text;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = p_target_user_id;

  UPDATE profiles
  SET is_active = NOT is_active
  WHERE id = p_target_user_id
  RETURNING is_active INTO v_new_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Cascade: blocking a manager → block only currently-active users, mark them
  IF v_role = 'manager' AND v_new_state = false THEN
    UPDATE profiles
    SET is_active = false,
        cascade_blocked_by = p_target_user_id
    WHERE id IN (
      SELECT user_id FROM manager_user_links WHERE manager_id = p_target_user_id
    )
    AND is_active = true;  -- skip users already individually blocked
  END IF;

  -- Cascade: unblocking a manager → unblock only users that were cascade-blocked with him
  IF v_role = 'manager' AND v_new_state = true THEN
    UPDATE profiles
    SET is_active = true,
        cascade_blocked_by = NULL
    WHERE cascade_blocked_by = p_target_user_id;
  END IF;

  INSERT INTO admin_action_logs (action, target_id, initiated_by)
  VALUES (
    CASE WHEN v_new_state THEN 'unblock' ELSE 'block' END,
    p_target_user_id,
    auth.uid()
  );
END;
$$;
