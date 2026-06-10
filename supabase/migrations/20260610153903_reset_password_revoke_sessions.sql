-- Revoke the target user's active sessions when an admin/manager resets their
-- password.
--
-- Background: admin_reset_password (super_admin) and manager_reset_password both
-- change the password by writing auth.users.encrypted_password directly, which
-- bypasses GoTrue. A direct UPDATE does NOT invalidate the user's existing
-- sessions, so a password reset performed to lock out a compromised account
-- would leave the attacker's live session working until its refresh token
-- naturally expired. Deleting the user's rows from auth.sessions force-logs them
-- out: auth.refresh_tokens.session_id has ON DELETE CASCADE, so the cascade
-- removes the refresh tokens and the next token refresh fails. (Already-issued
-- access tokens remain valid until their short JWT expiry — acceptable, and the
-- correct trade-off without rewiring these flows through the GoTrue Admin API.)
--
-- Both functions are recreated verbatim from their last definitions (005 /
-- 20260524100943) with the session-revocation DELETE added after the password
-- write. The SET search_path = public clause is re-stated because CREATE OR
-- REPLACE FUNCTION drops settings previously applied via ALTER FUNCTION
-- (migration 20260610132750 hardened both with search_path=public).

-- ── super_admin: reset any user's password ───────────────────────────────────
CREATE OR REPLACE FUNCTION admin_reset_password(
  p_target_user_id uuid,
  p_new_password   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Force-logout: drop active sessions (cascades to refresh_tokens) so the
  -- reset actually revokes access rather than just changing the credential.
  DELETE FROM auth.sessions WHERE user_id = p_target_user_id;

  INSERT INTO admin_action_logs (action, target_id, initiated_by)
  VALUES ('reset_password', p_target_user_id, auth.uid());
END;
$$;

-- ── manager: reset a linked user's password ──────────────────────────────────
CREATE OR REPLACE FUNCTION manager_reset_password(
  p_target_user_id uuid,
  p_new_password   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Force-logout: drop active sessions (cascades to refresh_tokens).
  DELETE FROM auth.sessions WHERE user_id = p_target_user_id;

  INSERT INTO admin_action_logs (action, target_id, initiated_by)
  VALUES ('reset_password', p_target_user_id, auth.uid());
END;
$$;
