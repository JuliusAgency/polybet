-- Migration 026: manager-side user blocking
-- Lets managers block and unblock only their linked users.

CREATE OR REPLACE FUNCTION manager_toggle_user_block(p_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
  v_is_linked boolean;
  v_new_state boolean;
BEGIN
  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_caller_role <> 'manager' THEN
    RAISE EXCEPTION 'Access denied: manager required';
  END IF;

  SELECT role INTO v_target_role
  FROM profiles
  WHERE id = p_target_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_target_role <> 'user' THEN
    RAISE EXCEPTION 'Only linked users can be managed';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM manager_user_links
    WHERE manager_id = auth.uid() AND user_id = p_target_user_id
  ) INTO v_is_linked;

  IF NOT v_is_linked THEN
    RAISE EXCEPTION 'User is not linked to this manager';
  END IF;

  UPDATE profiles
  SET is_active = NOT is_active,
      cascade_blocked_by = NULL
  WHERE id = p_target_user_id
  RETURNING is_active INTO v_new_state;

  INSERT INTO admin_action_logs (action, target_id, initiated_by)
  VALUES (
    CASE WHEN v_new_state THEN 'unblock' ELSE 'block' END,
    p_target_user_id,
    auth.uid()
  );
END;
$$;
