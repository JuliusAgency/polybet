import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const seedFile = path.resolve(
  '/home/dmitriy/Projects/JuliusAgency/polybet/polybet/supabase/seed/003_betting_history.sql'
);

test('local seed includes the admin-activity SQL file', () => {
  assert.equal(existsSync(seedFile), true);
});

test('admin-activity seed inserts admin action logs and a sync run', () => {
  const sql = readFileSync(seedFile, 'utf8');

  assert.match(sql, /INSERT INTO admin_action_logs/i);
  assert.match(sql, /INSERT INTO sync_runs/i);
});

test('admin-activity seed does not insert markets, outcomes, bets, or deposit ledger entries', () => {
  const sql = readFileSync(seedFile, 'utf8');

  assert.doesNotMatch(sql, /INSERT INTO markets/i);
  assert.doesNotMatch(sql, /INSERT INTO market_outcomes/i);
  assert.doesNotMatch(sql, /INSERT INTO bets/i);
  assert.doesNotMatch(sql, /INSERT INTO balance_transactions/i);
  assert.doesNotMatch(sql, /UPDATE balances/i);
  assert.doesNotMatch(sql, /UPDATE managers/i);
});
