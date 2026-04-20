-- Migration 054: drop Polymarket placeholder markets from the DB.
--
-- Context: events where participants are not yet known (e.g. "Eurovision 2026",
-- upcoming sports drafts) pre-create child markets named "Country A/B/...",
-- "Contestant 1/2/...". Those markets ship with volume = 0 and all outcome
-- prices = 0. The event itself may still be above the $500k threshold, so
-- migration 052 does not touch them. The batchWriter now skips these on
-- upsert; this migration clears legacy rows that were written before the
-- filter existed.
--
-- Same safety rule as migration 052: hard-delete when no bets exist,
-- soft-archive when they do.

DO $$
DECLARE
  v_to_delete  bigint;
  v_to_archive bigint;
BEGIN
  SELECT COUNT(*) INTO v_to_delete
  FROM markets m
  WHERE (m.volume IS NULL OR m.volume = 0)
    AND NOT EXISTS (SELECT 1 FROM bets b WHERE b.market_id = m.id)
    AND NOT EXISTS (
      SELECT 1 FROM market_outcomes mo
       WHERE mo.market_id = m.id
         AND mo.price IS NOT NULL
         AND mo.price > 0
    );

  SELECT COUNT(*) INTO v_to_archive
  FROM markets m
  WHERE (m.volume IS NULL OR m.volume = 0)
    AND m.status IS DISTINCT FROM 'archived'
    AND EXISTS (SELECT 1 FROM bets b WHERE b.market_id = m.id)
    AND NOT EXISTS (
      SELECT 1 FROM market_outcomes mo
       WHERE mo.market_id = m.id
         AND mo.price IS NOT NULL
         AND mo.price > 0
    );

  RAISE NOTICE 'placeholder cleanup plan: to_delete=% to_archive=%',
    v_to_delete, v_to_archive;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 1. Soft archive placeholders that somehow collected bets.
-- ────────────────────────────────────────────────────────────────
UPDATE markets m
   SET status      = 'archived',
       archived_at = COALESCE(m.archived_at, now()),
       is_visible  = false
 WHERE (m.volume IS NULL OR m.volume = 0)
   AND m.status IS DISTINCT FROM 'archived'
   AND EXISTS (SELECT 1 FROM bets b WHERE b.market_id = m.id)
   AND NOT EXISTS (
     SELECT 1 FROM market_outcomes mo
      WHERE mo.market_id = m.id
        AND mo.price IS NOT NULL
        AND mo.price > 0
   );

-- ────────────────────────────────────────────────────────────────
-- 2. Hard delete placeholders without bets. FK cascade handles
--    market_outcomes / market_settlement_logs / market_data_deltas.
-- ────────────────────────────────────────────────────────────────
UPDATE markets m
   SET winning_outcome_id = NULL
 WHERE m.winning_outcome_id IS NOT NULL
   AND (m.volume IS NULL OR m.volume = 0)
   AND NOT EXISTS (SELECT 1 FROM bets b WHERE b.market_id = m.id)
   AND NOT EXISTS (
     SELECT 1 FROM market_outcomes mo
      WHERE mo.market_id = m.id
        AND mo.price IS NOT NULL
        AND mo.price > 0
   );

DELETE FROM markets m
 WHERE (m.volume IS NULL OR m.volume = 0)
   AND NOT EXISTS (SELECT 1 FROM bets b WHERE b.market_id = m.id)
   AND NOT EXISTS (
     SELECT 1 FROM market_outcomes mo
      WHERE mo.market_id = m.id
        AND mo.price IS NOT NULL
        AND mo.price > 0
   );

-- ────────────────────────────────────────────────────────────────
-- 3. Remove events left with no markets after cleanup.
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_events_deleted bigint;
BEGIN
  DELETE FROM events e
   WHERE NOT EXISTS (SELECT 1 FROM markets m WHERE m.event_id = e.id);

  GET DIAGNOSTICS v_events_deleted = ROW_COUNT;
  RAISE NOTICE 'placeholder cleanup done: events_deleted=%', v_events_deleted;
END $$;
