import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/home/dmitriy/Projects/JuliusAgency/polybet/polybet';
const migrationFile = path.join(projectRoot, 'supabase/migrations/028_enforce_ledger_audit_guards.sql');
const walletHookFile = path.join(projectRoot, 'src/features/wallet/useUserTransactions.ts');

test('ledger guard migration exists and enforces append-only + same-transaction audit link', () => {
  assert.equal(existsSync(migrationFile), true);

  const sql = readFileSync(migrationFile, 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS ledger_xid xid8 NOT NULL DEFAULT pg_current_xact_id\(\)/);
  assert.match(sql, /CREATE TRIGGER trg_prevent_balance_transactions_mutation/i);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON balance_transactions/i);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER trg_balances_require_ledger/i);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER trg_managers_require_ledger/i);
  assert.match(sql, /AND bt\.ledger_xid = pg_current_xact_id\(\)/);
});

test('wallet transactions query includes all movement types and bet reference', () => {
  const source = readFileSync(walletHookFile, 'utf8');

  assert.match(source, /type:\s*'mint'\s*\|\s*'transfer'\s*\|\s*'bet_lock'\s*\|\s*'bet_payout'\s*\|\s*'adjustment'/);
  assert.match(source, /\.select\('id, created_at, type, amount, balance_after, bet_id, note'\)/);
  assert.doesNotMatch(source, /\.in\('type',\s*\['adjustment',\s*'transfer'\]\)/);
});
