-- Public read access to system_settings.category_subtags.
--
-- system_settings is otherwise super-admin SELECT-only (migration 039), which
-- is why the frontend category bar falls back to a hardcoded list for normal
-- users. The new `category_subtags` key (written hourly by the market-tracker
-- refreshCategorySubtags task) drives the per-category sub-tag bar on the feed
-- and must be readable by anon + authenticated users.
--
-- This permissive policy is scoped to that single key, so it is purely additive
-- (RLS policies OR together): every other system_settings row stays
-- super-admin-only. The value is public UI config — safe to expose.

DROP POLICY IF EXISTS "Public reads category_subtags" ON public.system_settings;
CREATE POLICY "Public reads category_subtags" ON public.system_settings
  FOR SELECT
  USING (key = 'category_subtags');

-- Seed the key so the row exists and is discoverable before the tracker first
-- populates it. The market-tracker upserts the real, live value on its hourly
-- tick; until then the frontend hook falls back to its bundled defaults.
INSERT INTO public.system_settings (key, value)
VALUES ('category_subtags', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON POLICY "Public reads category_subtags" ON public.system_settings IS
  'Allows anon + authenticated to read only the category_subtags key (public feed config). All other keys remain super-admin SELECT-only.';
