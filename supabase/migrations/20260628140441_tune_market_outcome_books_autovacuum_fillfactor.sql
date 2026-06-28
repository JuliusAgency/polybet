-- Incident fix (2026-06-28) — Tier 3: tune market_outcome_books for its write pattern.
--
-- market_outcome_books is re-stamped every ~15s per subscribed token by the
-- market-tracker bookWriter (BOOK_RESTAMP_INTERVAL_MS) so place_bet /
-- sell_position's <=30s live-book freshness gate keeps passing for quiet-but-live
-- books. With the default fillfactor=100 those re-stamps could not be HOT (no
-- free space on the page) -> every re-stamp wrote a new tuple + a dead tuple,
-- leaving the table ~49% dead and burning disk IO on an already IO-throttled
-- instance.
--
-- fillfactor=80 leaves page headroom so an updated_at-only re-stamp can be a HOT
-- update (no indexed column changes), avoiding new tuple versions + index churn.
-- Aggressive autovacuum keeps this small (~11k row) high-churn table's dead
-- tuples low. fillfactor applies to pages as they turn over (fast at this churn);
-- pre-existing bloat is reclaimed by (auto)vacuum for reuse.
--
-- Idempotent — safe to re-apply.

ALTER TABLE public.market_outcome_books SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold    = 50,
  fillfactor                     = 80
);
