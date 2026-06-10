-- SECURITY (audit 2026-06-10): defense-in-depth hardening.
--   1. Explicit write-RLS for system_settings (was SELECT-only).
--   2. Non-negative CHECK invariants on balances (money safety net).
--   3. SET search_path = public on every SECURITY DEFINER function that lacks
--      it (search_path-injection hardening / best practice).

-- 1. system_settings: only SELECT was policed. Writes relied on the ABSENCE of
--    a write policy (deny-by-default) — fragile, since any future GRANT would
--    silently open it. Add an explicit super_admin-only write policy so the
--    intent is encoded, and super_admin upserts have a real ALLOW path.
DROP POLICY IF EXISTS "Super admin writes system settings" ON public.system_settings;
CREATE POLICY "Super admin writes system settings"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 2. balances must never go negative. The RPCs already guard this, but a DB
--    constraint is the last line of defense against a future-RPC bug or a
--    stray service-role UPDATE. NOT VALID so the migration does not fail on a
--    pre-existing bad row in prod; it is still enforced for every new
--    INSERT/UPDATE. Run `VALIDATE CONSTRAINT` after confirming no negatives.
ALTER TABLE public.balances
  ADD CONSTRAINT balances_available_non_negative CHECK (available >= 0) NOT VALID;
ALTER TABLE public.balances
  ADD CONSTRAINT balances_in_play_non_negative CHECK (in_play >= 0) NOT VALID;

-- On a fresh/clean dataset there are no negatives, so validate immediately.
-- (Wrapped so a prod row with a pre-existing negative does not abort the whole
-- migration — it will simply stay NOT VALID and surface in db advisors.)
DO $$
BEGIN
  ALTER TABLE public.balances VALIDATE CONSTRAINT balances_available_non_negative;
  ALTER TABLE public.balances VALIDATE CONSTRAINT balances_in_play_non_negative;
EXCEPTION WHEN check_violation THEN
  RAISE WARNING 'balances non-negative constraints left NOT VALID: pre-existing negative row(s) present — investigate before validating';
END $$;

-- 3. Every SECURITY DEFINER function in public should pin search_path so it
--    cannot be redirected to attacker-controlled objects. Apply to all that
--    are currently missing it (idempotent: re-running is a no-op).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;
