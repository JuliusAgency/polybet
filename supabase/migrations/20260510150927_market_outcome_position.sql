-- Adds market_outcomes.position so the canonical Yes/No order is encoded
-- at the storage layer instead of relying on physical row order.
--
-- Why: the markets feed and event detail pages render two outcome buttons
-- (Buy Yes / Buy No) and a "% chance" — implicitly assuming
-- market_outcomes[0] is Yes. Postgres returns embedded rows in
-- arbitrary order via PostgREST, which means [0] sometimes resolves to No.
-- That flips the displayed probability and the button colours
-- (Belgium and Albania showed ">99%" while their actual Yes price was
-- 0.001 — see screenshots from 2026-05-10 QA).
--
-- Convention: position 0 = Yes side (or "primary"), 1 = No side.
-- Non-binary multi-outcome markets keep the default 0 — the application
-- layer falls back to source order when the binary names aren't matched.
--
-- A BEFORE INSERT/UPDATE trigger derives position from the outcome name
-- so every writer (bulk_upsert_outcomes, admin_create_demo_event, manual
-- SQL, future syncs) stays consistent without extra wiring.

-- 1. Column with fast default (no table rewrite on PG 11+).
ALTER TABLE market_outcomes
  ADD COLUMN IF NOT EXISTS position smallint NOT NULL DEFAULT 0;

-- 2. Trigger function: name → position. Idempotent, safe to re-run.
CREATE OR REPLACE FUNCTION market_outcomes_set_position()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.position := CASE lower(btrim(NEW.name))
    WHEN 'no'    THEN 1
    WHEN 'false' THEN 1
    WHEN 'short' THEN 1
    ELSE 0
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS market_outcomes_set_position_trg ON market_outcomes;
CREATE TRIGGER market_outcomes_set_position_trg
  BEFORE INSERT OR UPDATE OF name ON market_outcomes
  FOR EACH ROW
  EXECUTE FUNCTION market_outcomes_set_position();

-- 3. Backfill existing rows. Trigger fires on UPDATE OF name, so re-set
--    name to itself to recompute position in one statement.
UPDATE market_outcomes SET name = name;

-- 4. Composite index supporting `ORDER BY position` inside the embedded
--    select used by PostgREST. Most queries already filter by market_id
--    via the FK join, so this composite gives a covering sort.
CREATE INDEX IF NOT EXISTS idx_market_outcomes_market_position
  ON market_outcomes (market_id, position);

COMMENT ON COLUMN market_outcomes.position IS
  'Canonical sort order: 0 = Yes / primary side, 1 = No / negative side. '
  'Maintained automatically by market_outcomes_set_position trigger.';
