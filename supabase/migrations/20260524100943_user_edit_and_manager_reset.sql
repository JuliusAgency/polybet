-- Migration: privileged user-profile edit + manager password reset
--
-- QA rejection 2026-05-24:
--   Bug A: super-admin must edit an assigned user's first/last name + phone.
--   Bug B: a manager must edit a linked user's first/last name + phone AND
--          reset that user's password.
--
-- Pattern mirrors 005 (admin_reset_password) and 026 (manager_toggle_user_block):
-- SECURITY DEFINER, role gate, manager_user_links link check, action logged to
-- admin_action_logs. full_name is recomputed so display sites stay consistent.

-- ── A. super_admin: update a user's profile fields ───────────────────────────

CREATE OR REPLACE FUNCTION admin_update_user(
  p_target_user_id uuid,
  p_first_name     text,
  p_last_name      text,
  p_phone          text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last  text := btrim(coalesce(p_last_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  IF v_first = '' THEN
    RAISE EXCEPTION 'First name is required';
  END IF;

  UPDATE profiles
  SET first_name = v_first,
      last_name  = v_last,
      full_name  = btrim(v_first || ' ' || v_last),
      phone      = v_phone
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO admin_action_logs (action, target_id, initiated_by)
  VALUES ('update_profile', p_target_user_id, auth.uid());
END;
$$;

-- ── B. manager: update a linked user's profile fields ────────────────────────

CREATE OR REPLACE FUNCTION manager_update_linked_user(
  p_target_user_id uuid,
  p_first_name     text,
  p_last_name      text,
  p_phone          text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
  v_is_linked   boolean;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last  text := btrim(coalesce(p_last_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role <> 'manager' THEN
    RAISE EXCEPTION 'Access denied: manager required';
  END IF;

  IF v_first = '' THEN
    RAISE EXCEPTION 'First name is required';
  END IF;

  SELECT role INTO v_target_role FROM profiles WHERE id = p_target_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_target_role <> 'user' THEN
    RAISE EXCEPTION 'Only linked users can be managed';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM manager_user_links
    WHERE manager_id = auth.uid() AND user_id = p_target_user_id
  ) INTO v_is_linked;
  IF NOT v_is_linked THEN
    RAISE EXCEPTION 'User is not linked to this manager';
  END IF;

  UPDATE profiles
  SET first_name = v_first,
      last_name  = v_last,
      full_name  = btrim(v_first || ' ' || v_last),
      phone      = v_phone
  WHERE id = p_target_user_id;

  INSERT INTO admin_action_logs (action, target_id, initiated_by)
  VALUES ('update_profile', p_target_user_id, auth.uid());
END;
$$;

-- ── C. manager: reset a linked user's password ───────────────────────────────

CREATE OR REPLACE FUNCTION manager_reset_password(
  p_target_user_id uuid,
  p_new_password   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
  v_is_linked   boolean;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role <> 'manager' THEN
    RAISE EXCEPTION 'Access denied: manager required';
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  SELECT role INTO v_target_role FROM profiles WHERE id = p_target_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_target_role <> 'user' THEN
    RAISE EXCEPTION 'Only linked users can be managed';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM manager_user_links
    WHERE manager_id = auth.uid() AND user_id = p_target_user_id
  ) INTO v_is_linked;
  IF NOT v_is_linked THEN
    RAISE EXCEPTION 'User is not linked to this manager';
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
