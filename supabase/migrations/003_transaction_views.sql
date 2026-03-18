-- Migration 003: Financial transaction view for Super Admin
-- Creates a read-only view of deposits and withdrawals with joined profile data
--
-- Security: VIEW uses security_invoker = on (Postgres 15+, supported by Supabase).
-- This means the view runs with the calling user's identity, so existing RLS
-- policies on balance_transactions and profiles are automatically enforced.
-- Super Admin can see all rows (policy: "Super admin can view all transactions").
-- Managers and Users see only their own data per existing RLS.

CREATE VIEW admin_financial_transactions
  WITH (security_invoker = on)
AS
SELECT
  bt.id,
  bt.created_at,
  bt.type,
  bt.amount,
  bt.balance_after,
  bt.note,
  -- User target
  bt.user_id,
  up.username      AS user_username,
  up.full_name     AS user_full_name,
  -- Manager (who initiated)
  bt.initiated_by,
  mp.username      AS manager_username,
  mp.full_name     AS manager_full_name,
  mp.role          AS initiator_role
FROM balance_transactions bt
JOIN profiles up ON up.id = bt.user_id
JOIN profiles mp ON mp.id = bt.initiated_by
WHERE bt.type IN ('adjustment', 'transfer');

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_balance_transactions_initiated_by
  ON balance_transactions(initiated_by);

CREATE INDEX IF NOT EXISTS idx_balance_transactions_created_at
  ON balance_transactions(created_at);
