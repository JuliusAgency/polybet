-- Migration: balance_transactions support for the positions/trades model
--
-- Three changes, all additive and back-compatible with the legacy bet_id-keyed
-- ledger rows:
--
--   1. New ledger type 'bet_sell' — the credit a user receives when selling
--      shares back to the house before resolution (proceeds from walking the
--      bid side). Sits in the same family as bet_lock (buy, debit) and
--      bet_payout (settlement, credit).
--
--   2. New reference columns trade_id / position_id. In the new model a ledger
--      row points at the trade (buy/sell fill) or the position it settled,
--      instead of a bets row. bet_id stays for legacy rows and is left NULL by
--      the new RPCs.
--
--   3. Idempotency unique indexes keyed on the new references, mirroring the
--      legacy uq_balance_transactions_bet_lock/bet_payout (which were keyed on
--      bet_id and only ever matched legacy rows). settle_market's re-entry
--      guard (ON CONFLICT DO NOTHING) now keys on the per-position payout index.
--
-- Lock-safety on prod (balance_transactions can be large): the widened CHECK is
-- a strict superset so every existing row already passes — added NOT VALID then
-- VALIDATE to avoid a full-scan ACCESS EXCLUSIVE hold. New columns are nullable
-- with no default (metadata-only add); their FKs are added NOT VALID + VALIDATE.

-- ── 1. New columns (no inline FK so we can add the FK NOT VALID) ──────────────
ALTER TABLE balance_transactions
  ADD COLUMN trade_id    uuid,
  ADD COLUMN position_id uuid;

ALTER TABLE balance_transactions
  ADD CONSTRAINT balance_transactions_trade_id_fkey
    FOREIGN KEY (trade_id) REFERENCES trades(id) NOT VALID,
  ADD CONSTRAINT balance_transactions_position_id_fkey
    FOREIGN KEY (position_id) REFERENCES positions(id) NOT VALID;

ALTER TABLE balance_transactions VALIDATE CONSTRAINT balance_transactions_trade_id_fkey;
ALTER TABLE balance_transactions VALIDATE CONSTRAINT balance_transactions_position_id_fkey;

COMMENT ON COLUMN balance_transactions.trade_id IS
  'New model: the trades row this ledger entry records (buy bet_lock / sell bet_sell). NULL for legacy and settlement rows.';
COMMENT ON COLUMN balance_transactions.position_id IS
  'New model: the positions row this ledger entry settled (bet_payout at resolution). NULL for legacy and per-trade rows.';

-- ── 2. Widen the type CHECK with 'bet_sell' (superset → NOT VALID + VALIDATE) ─
ALTER TABLE balance_transactions DROP CONSTRAINT balance_transactions_type_check;
ALTER TABLE balance_transactions
  ADD CONSTRAINT balance_transactions_type_check
    CHECK (type IN ('mint', 'transfer', 'bet_lock', 'bet_payout', 'adjustment', 'bet_sell'))
    NOT VALID;
ALTER TABLE balance_transactions VALIDATE CONSTRAINT balance_transactions_type_check;

-- ── 3. Idempotency indexes for the new model ─────────────────────────────────
-- One bet_lock per buy trade, one bet_sell per sell trade, one bet_payout per
-- settled position. settle_market relies on the payout index for ON CONFLICT.
CREATE UNIQUE INDEX uq_balance_transactions_trade_lock
  ON balance_transactions (trade_id)
  WHERE type = 'bet_lock' AND trade_id IS NOT NULL;

CREATE UNIQUE INDEX uq_balance_transactions_trade_sell
  ON balance_transactions (trade_id)
  WHERE type = 'bet_sell' AND trade_id IS NOT NULL;

CREATE UNIQUE INDEX uq_balance_transactions_position_payout
  ON balance_transactions (position_id)
  WHERE type = 'bet_payout' AND position_id IS NOT NULL;
