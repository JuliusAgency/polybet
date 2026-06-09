-- Make market_outcome_books.updated_at authoritative from the Postgres clock.
--
-- WHY: place_bet / sell_position reject with "Market book is stale" when
-- quote_bet_payout().book_updated_at (= market_outcome_books.updated_at) is
-- older than c_book_max_staleness (30s) relative to Postgres now(). But that
-- updated_at is written by the BOOK WRITERS using THEIR OWN wall clock:
--   - the quote-bet / quote-sell edge functions set `updated_at: new Date()`
--     (Deno runtime clock), and
--   - the market-tracker bookWriter (a separate Heroku process) sets it from
--     its own clock.
-- Comparing a writer-stamped timestamp against the Postgres clock means ANY
-- cross-runtime clock skew (edge <-> db, or tracker <-> db) is charged against
-- the 30s budget and can flip a perfectly fresh book to "stale", rejecting a
-- legitimate bet. The column already DEFAULTs to now(), but every upsert passes
-- an explicit `updated_at`, so the default never applies.
--
-- FIX: a BEFORE INSERT OR UPDATE trigger that overwrites updated_at with the
-- Postgres now() on every write, regardless of what the writer sent. Now the
-- value place_bet compares and the now() it compares against come from the SAME
-- clock -- skew can never produce a false stale. This neutralizes BOTH writers
-- without requiring a coordinated edge/tracker deploy (their payload updated_at
-- simply becomes a no-op). The 30s antifraud bound and the 2% drift guard are
-- unchanged: a book that genuinely has not been written in >30s is still
-- rejected, because the trigger only stamps now() when a write actually happens.

CREATE OR REPLACE FUNCTION market_outcome_books_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_outcome_books_touch ON market_outcome_books;

CREATE TRIGGER trg_market_outcome_books_touch
  BEFORE INSERT OR UPDATE ON market_outcome_books
  FOR EACH ROW
  EXECUTE FUNCTION market_outcome_books_touch_updated_at();

COMMENT ON FUNCTION market_outcome_books_touch_updated_at() IS
  'Forces market_outcome_books.updated_at to the Postgres clock on every write so the place_bet/sell_position staleness guard compares two values from the same clock (no edge/tracker skew). See migration 20260609131610.';
