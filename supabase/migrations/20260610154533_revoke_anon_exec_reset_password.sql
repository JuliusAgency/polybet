-- Defense in depth: revoke anon EXECUTE on the password-reset RPCs.
--
-- admin_reset_password / manager_reset_password are SECURITY DEFINER functions
-- in the public schema, so Postgres granted EXECUTE to PUBLIC by default and the
-- anon role inherits it (flagged by db advisors:
-- anon_security_definer_function_executable). Their bodies already gate anon
-- (is_super_admin() and the manager_user_links ownership check both fail for a
-- NULL auth.uid()), so this is not an exploitable bypass — but a password-reset
-- endpoint should not be reachable by the unauthenticated role at all. The
-- frontend always calls these through an authenticated session, so authenticated
-- (role-gated inside the function) and service_role keep EXECUTE.

REVOKE EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.manager_reset_password(uuid, text) FROM anon;
