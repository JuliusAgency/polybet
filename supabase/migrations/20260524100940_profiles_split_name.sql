-- Migration: split profiles.full_name into first_name / last_name
--
-- QA rejection 2026-05-24: super-admin and managers must edit users' first
-- name, last name and phone separately. The schema only had full_name.
--
-- We ADD first_name / last_name but KEEP full_name as the canonical display
-- column that the rest of the app (tables, admin_combined_action_logs view,
-- exports) reads. full_name is kept in sync as trim(first_name || ' ' ||
-- last_name) by the update RPCs (see next migration) and by create-user.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name  text NOT NULL DEFAULT '';

-- Backfill existing rows: first whitespace-delimited token -> first_name,
-- the remainder -> last_name. No-op on a fresh local reset (profiles are
-- seeded after migrations) but required for prod rows that already exist.
UPDATE profiles
SET
  first_name = COALESCE(split_part(full_name, ' ', 1), ''),
  last_name  = COALESCE(NULLIF(regexp_replace(full_name, '^\S+\s*', ''), ''), '')
WHERE full_name IS NOT NULL
  AND full_name <> ''
  AND first_name = ''
  AND last_name = '';
