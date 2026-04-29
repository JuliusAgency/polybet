-- Migration 068: one-off cleanup of all demo data from production.
--
-- Removes:
--   • demo bets and their balance_transactions / settlement logs
--   • demo markets (CASCADE drops market_outcomes, market_settlement_logs,
--     market_data_deltas, user_favorite_markets)
--   • seed deposit/withdrawal ledger rows (matched by their fixed UUIDs from
--     supabase/seed/003_betting_history.sql)
--
-- Demo rows are matched by markets.polymarket_id LIKE 'demo:%' which covers
-- both the local seed (demo:local:*) and any prod-demo seed run historically
-- (demo:prod_demo_v1:*).
--
-- ─────────────────────────────────────────────────────────────────────────
-- Transaction wrapping
-- ─────────────────────────────────────────────────────────────────────────
-- supabase CLI applies migrations in autocommit (each statement runs in its
-- own implicit transaction). That breaks two things this cleanup needs:
--   1. SET LOCAL — silently ignored without an explicit transaction.
--   2. Atomicity — a partial cleanup must not leave the DB half-modified
--      (with audit triggers off, for instance).
-- We wrap the entire body in BEGIN/COMMIT so SET LOCAL applies and the
-- whole cleanup is atomic.
--
-- Refund ordering: open demo bet stake is refunded BEFORE the bets are
-- deleted, using an inline subquery over (bets JOIN markets). This avoids
-- the need for a TEMP TABLE that wouldn't survive autocommit dropping it.
--
-- balance_transactions is append-only (migration 028) and balance mutations
-- normally require a same-transaction ledger row. Both audit guards are
-- disabled at the start and re-enabled before COMMIT.

BEGIN;

SET LOCAL statement_timeout = '10min';
SET LOCAL lock_timeout = '30s';

-- ── Stage 1: diagnostic counts ───────────────────────────────────────────
DO $$
DECLARE
  v_demo_markets   int;
  v_demo_bets      int;
  v_seed_deposits  int;
BEGIN
  SELECT COUNT(*) INTO v_demo_markets
  FROM markets WHERE polymarket_id LIKE 'demo:%';

  SELECT COUNT(*) INTO v_demo_bets
  FROM bets b JOIN markets m ON m.id = b.market_id
  WHERE m.polymarket_id LIKE 'demo:%';

  SELECT COUNT(*) INTO v_seed_deposits
  FROM balance_transactions
  WHERE id IN (
    '13000000-0000-0000-0000-000000000001',
    '13000000-0000-0000-0000-000000000002',
    '13000000-0000-0000-0000-000000000003',
    '13000000-0000-0000-0000-000000000004'
  );

  RAISE NOTICE
    'migration 068 starting: % demo markets, % demo bets, % seed deposits',
    v_demo_markets, v_demo_bets, v_seed_deposits;
END $$;

-- ── Stage 2: disable audit guards ────────────────────────────────────────
ALTER TABLE balance_transactions DISABLE TRIGGER trg_prevent_balance_transactions_mutation;
ALTER TABLE balances             DISABLE TRIGGER trg_balances_require_ledger;
ALTER TABLE managers             DISABLE TRIGGER trg_managers_require_ledger;

-- ── Stage 3: refund in_play stake from open demo bets ────────────────────
-- Done BEFORE deleting the bets so we can compute the refund inline.
UPDATE balances bal
SET available  = bal.available + r.refund_amount,
    in_play    = GREATEST(bal.in_play - r.refund_amount, 0),
    updated_at = now()
FROM (
  SELECT b.user_id, SUM(b.stake)::numeric AS refund_amount
  FROM bets b
  JOIN markets m ON m.id = b.market_id
  WHERE m.polymarket_id LIKE 'demo:%'
    AND b.status = 'open'
  GROUP BY b.user_id
) r
WHERE bal.user_id = r.user_id;

-- ── Stage 4: delete bet-linked ledger rows ───────────────────────────────
-- balance_transactions.bet_id has no CASCADE — must run before bet deletion.
DELETE FROM balance_transactions
WHERE bet_id IN (
  SELECT b.id
  FROM bets b
  JOIN markets m ON m.id = b.market_id
  WHERE m.polymarket_id LIKE 'demo:%'
);

-- ── Stage 5: delete demo bets ────────────────────────────────────────────
-- bet_settlement_logs.bet_id has ON DELETE CASCADE (migration 017).
DELETE FROM bets b
USING markets m
WHERE m.id = b.market_id
  AND m.polymarket_id LIKE 'demo:%';

-- ── Stage 6: delete market-level settlement logs ─────────────────────────
DELETE FROM market_settlement_logs
WHERE market_id IN (SELECT id FROM markets WHERE polymarket_id LIKE 'demo:%');

-- ── Stage 7: delete demo markets ─────────────────────────────────────────
-- CASCADE handles market_outcomes (001), market_data_deltas (029),
-- user_favorite_markets (059). markets.event_id is ON DELETE SET NULL (048),
-- events themselves are untouched.
DELETE FROM markets WHERE polymarket_id LIKE 'demo:%';

-- ── Stage 8: delete seeded deposit ledger rows ───────────────────────────
DELETE FROM balance_transactions
WHERE id IN (
  '13000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000002',
  '13000000-0000-0000-0000-000000000003',
  '13000000-0000-0000-0000-000000000004'
);

-- ── Stage 9: re-enable audit guards ──────────────────────────────────────
ALTER TABLE balance_transactions ENABLE TRIGGER trg_prevent_balance_transactions_mutation;
ALTER TABLE balances             ENABLE TRIGGER trg_balances_require_ledger;
ALTER TABLE managers             ENABLE TRIGGER trg_managers_require_ledger;

-- ── Stage 10: final verification ─────────────────────────────────────────
DO $$
DECLARE
  v_remaining_markets int;
  v_remaining_bets    int;
BEGIN
  SELECT COUNT(*) INTO v_remaining_markets
  FROM markets WHERE polymarket_id LIKE 'demo:%';

  SELECT COUNT(*) INTO v_remaining_bets
  FROM bets b JOIN markets m ON m.id = b.market_id
  WHERE m.polymarket_id LIKE 'demo:%';

  RAISE NOTICE
    'migration 068 complete: % demo markets remaining, % demo bets remaining',
    v_remaining_markets, v_remaining_bets;

  IF v_remaining_markets > 0 OR v_remaining_bets > 0 THEN
    RAISE EXCEPTION 'migration 068 left % demo markets / % demo bets behind',
      v_remaining_markets, v_remaining_bets;
  END IF;
END $$;

COMMIT;
