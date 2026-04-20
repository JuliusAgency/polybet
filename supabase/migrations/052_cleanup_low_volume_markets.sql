-- Migration 052: cleanup markets below the $500k lifetime-volume threshold.
--
-- Policy:
--   - From now on the platform only tracks events whose parent has ever reached
--     >= $500k in lifetime volume on Polymarket. Markets outside that set are
--     stripped from the DB to keep sync fast and storage bounded.
--   - Hard delete markets that have NO bets: cascades through market_outcomes,
--     market_settlement_logs, market_data_deltas.
--   - Markets WITH bets cannot be deleted (immutable ledger rule) — they are
--     soft-archived (status='archived', archived_at=now(), is_visible=false).
--   - Events with zero remaining markets are deleted outright.
--
-- Idempotent: re-running the migration is a no-op once the state matches.

DO $$
DECLARE
  v_threshold      numeric := 500000;
  v_total_markets  bigint;
  v_to_delete      bigint;
  v_to_archive     bigint;
  v_events_before  bigint;
  v_events_empty   bigint;
BEGIN
  SELECT COUNT(*) INTO v_total_markets FROM markets;
  SELECT COUNT(*) INTO v_events_before FROM events;

  -- Markets that fail the new rule: no parent event, or parent volume < threshold.
  -- (Orphan markets without event_id never belonged to a qualifying event, so
  -- they are dropped as well — enforces the new "market must have event" rule.)
  SELECT COUNT(*) INTO v_to_delete
  FROM markets m
  WHERE NOT EXISTS (SELECT 1 FROM bets b WHERE b.market_id = m.id)
    AND (
      m.event_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM events e
         WHERE e.id = m.event_id AND e.volume >= v_threshold
      )
    );

  SELECT COUNT(*) INTO v_to_archive
  FROM markets m
  WHERE EXISTS (SELECT 1 FROM bets b WHERE b.market_id = m.id)
    AND (m.status IS DISTINCT FROM 'archived')
    AND (
      m.event_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM events e
         WHERE e.id = m.event_id AND e.volume >= v_threshold
      )
    );

  RAISE NOTICE 'cleanup plan: total_markets=% to_delete=% to_archive=% events_total=%',
    v_total_markets, v_to_delete, v_to_archive, v_events_before;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 1. Soft archive markets that have bets and fail the volume rule.
-- ────────────────────────────────────────────────────────────────
UPDATE markets m
   SET status      = 'archived',
       archived_at = COALESCE(m.archived_at, now()),
       is_visible  = false
 WHERE EXISTS (SELECT 1 FROM bets b WHERE b.market_id = m.id)
   AND (m.status IS DISTINCT FROM 'archived')
   AND (
     m.event_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM events e
        WHERE e.id = m.event_id AND e.volume >= 500000
     )
   );

-- ────────────────────────────────────────────────────────────────
-- 2. Hard delete markets without bets that fail the volume rule.
--    FK cascades handle: market_outcomes, market_settlement_logs,
--    market_data_deltas. markets.winning_outcome_id points at own outcomes
--    and is resolved within the same statement.
-- ────────────────────────────────────────────────────────────────
-- Null winning_outcome_id first to avoid any FK ambiguity during cascade.
UPDATE markets m
   SET winning_outcome_id = NULL
 WHERE m.winning_outcome_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM bets b WHERE b.market_id = m.id)
   AND (
     m.event_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM events e
        WHERE e.id = m.event_id AND e.volume >= 500000
     )
   );

DELETE FROM markets m
 WHERE NOT EXISTS (SELECT 1 FROM bets b WHERE b.market_id = m.id)
   AND (
     m.event_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM events e
        WHERE e.id = m.event_id AND e.volume >= 500000
     )
   );

-- ────────────────────────────────────────────────────────────────
-- 3. Delete events that no longer have any markets.
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_events_deleted bigint;
BEGIN
  DELETE FROM events e
   WHERE NOT EXISTS (SELECT 1 FROM markets m WHERE m.event_id = e.id);

  GET DIAGNOSTICS v_events_deleted = ROW_COUNT;
  RAISE NOTICE 'cleanup done: events_deleted=%', v_events_deleted;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 4. Post-condition assertions (cheap, fail-fast if something slipped).
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_bad_markets bigint;
  v_orphan_evts bigint;
BEGIN
  SELECT COUNT(*) INTO v_bad_markets
    FROM markets m
   WHERE m.status != 'archived'
     AND NOT EXISTS (SELECT 1 FROM bets b WHERE b.market_id = m.id)
     AND (
       m.event_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM events e
          WHERE e.id = m.event_id AND e.volume >= 500000
       )
     );

  IF v_bad_markets > 0 THEN
    RAISE EXCEPTION 'cleanup assertion failed: % low-volume markets still active', v_bad_markets;
  END IF;

  SELECT COUNT(*) INTO v_orphan_evts
    FROM events e
   WHERE NOT EXISTS (SELECT 1 FROM markets m WHERE m.event_id = e.id);

  IF v_orphan_evts > 0 THEN
    RAISE EXCEPTION 'cleanup assertion failed: % empty events remain', v_orphan_evts;
  END IF;
END $$;
