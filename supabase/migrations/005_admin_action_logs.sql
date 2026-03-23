-- Migration 005: Admin action logs
-- Logs non-financial admin actions: block/unblock, password reset.
-- Financial actions (deposit/withdraw) are already logged in balance_transactions.

CREATE TABLE admin_action_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  action       text NOT NULL,           -- 'block' | 'unblock' | 'reset_password'
  target_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  initiated_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_admin_action_logs_target     ON admin_action_logs(target_id);
CREATE INDEX idx_admin_action_logs_initiator  ON admin_action_logs(initiated_by);
CREATE INDEX idx_admin_action_logs_created_at ON admin_action_logs(created_at);

-- RLS: only super_admin can read
ALTER TABLE admin_action_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can view all action logs"
  ON admin_action_logs FOR SELECT
  USING (is_super_admin());

-- ── Update admin_toggle_user_block to log the action ─────────────────────────

CREATE OR REPLACE FUNCTION admin_toggle_user_block(p_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_state boolean;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  UPDATE profiles
  SET is_active = NOT is_active
  WHERE id = p_target_user_id
  RETURNING is_active INTO v_new_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO admin_action_logs (action, target_id, initiated_by)
  VALUES (
    CASE WHEN v_new_state THEN 'unblock' ELSE 'block' END,
    p_target_user_id,
    auth.uid()
  );
END;
$$;

-- ── Update admin_reset_password to log the action ────────────────────────────

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

  INSERT INTO admin_action_logs (action, target_id, initiated_by)
  VALUES ('reset_password', p_target_user_id, auth.uid());
END;
$$;

-- ── View: combined log (financial + non-financial) ───────────────────────────
-- Returns unified log for ManagerProfilePage.

CREATE VIEW admin_combined_action_logs
  WITH (security_invoker = on)
AS
  -- Financial: deposit / withdrawal
  SELECT
    bt.id,
    bt.created_at,
    bt.type                  AS action,
    bt.amount,
    bt.note,
    bt.user_id               AS target_id,
    up.username              AS target_username,
    up.full_name             AS target_full_name,
    bt.initiated_by,
    mp.username              AS initiator_username,
    mp.role                  AS initiator_role
  FROM balance_transactions bt
  JOIN profiles up ON up.id = bt.user_id
  JOIN profiles mp ON mp.id = bt.initiated_by
  WHERE bt.type IN ('adjustment', 'transfer')

UNION ALL

  -- Non-financial: block / unblock / reset_password
  SELECT
    al.id,
    al.created_at,
    al.action,
    NULL::numeric            AS amount,
    NULL::text               AS note,
    al.target_id,
    up.username              AS target_username,
    up.full_name             AS target_full_name,
    al.initiated_by,
    mp.username              AS initiator_username,
    mp.role                  AS initiator_role
  FROM admin_action_logs al
  JOIN profiles up ON up.id = al.target_id
  JOIN profiles mp ON mp.id = al.initiated_by;
