-- Migration: backfill NULL close_at for open markets to a far-future timestamp.
--
-- place_bet now requires close_at IS NOT NULL AND close_at > now(). Markets
-- ingested before Polymarket's Gamma API returned an endDate (or markets
-- without a real deadline, e.g. long-running political ones) have NULL here
-- and would fail the new guard.
--
-- Strategy: backfill NULL to now() + 1 year on currently-open markets only.
-- That keeps the market bettable until either sync writes a real close_at
-- (the sync runtimes are updated in the same change-set to impute +1y on
-- insert, so they will not regress to NULL) or until the year elapses, at
-- which point ops will notice. Historical closed/resolved/archived rows are
-- left untouched — they are not in any betting path.
--
-- Not wrapping in a CHECK constraint: legacy non-open rows can keep NULL.

UPDATE markets
SET close_at = now() + interval '1 year'
WHERE close_at IS NULL
  AND status = 'open';
