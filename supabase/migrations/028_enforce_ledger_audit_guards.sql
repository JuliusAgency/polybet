-- Migration 028: Enforce balance-change audit guards
-- Guarantees that any balance mutation has a same-transaction ledger entry.

-- Track the originating transaction for each ledger row.
ALTER TABLE balance_transactions
  ADD COLUMN IF NOT EXISTS ledger_xid xid8 NOT NULL DEFAULT pg_current_xact_id();

CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_xid
  ON balance_transactions(user_id, ledger_xid);

-- Hard-enforce append-only semantics on the ledger table.
CREATE OR REPLACE FUNCTION prevent_balance_transactions_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'balance_transactions is append-only (% is not allowed)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_balance_transactions_mutation ON balance_transactions;
CREATE TRIGGER trg_prevent_balance_transactions_mutation
BEFORE UPDATE OR DELETE ON balance_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_balance_transactions_mutation();

-- Deferred guard so update+insert order inside RPC does not matter.
CREATE OR REPLACE FUNCTION assert_balance_change_has_ledger_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'balances' THEN
    -- Ignore updates that do not touch actual monetary values.
    IF NEW.available IS NOT DISTINCT FROM OLD.available
       AND NEW.in_play IS NOT DISTINCT FROM OLD.in_play THEN
      RETURN NEW;
    END IF;
    v_actor_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'managers' THEN
    IF NEW.balance IS NOT DISTINCT FROM OLD.balance THEN
      RETURN NEW;
    END IF;
    v_actor_id := NEW.id;
  ELSE
    RAISE EXCEPTION 'assert_balance_change_has_ledger_row() called from unsupported table: %', TG_TABLE_NAME;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM balance_transactions bt
    WHERE bt.user_id = v_actor_id
      AND bt.ledger_xid = pg_current_xact_id()
  ) THEN
    RAISE EXCEPTION
      'Balance changed for % (%) without a ledger record in the same transaction',
      TG_TABLE_NAME,
      v_actor_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_balances_require_ledger ON balances;
CREATE CONSTRAINT TRIGGER trg_balances_require_ledger
AFTER UPDATE OF available, in_play ON balances
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_balance_change_has_ledger_row();

DROP TRIGGER IF EXISTS trg_managers_require_ledger ON managers;
CREATE CONSTRAINT TRIGGER trg_managers_require_ledger
AFTER UPDATE OF balance ON managers
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_balance_change_has_ledger_row();
