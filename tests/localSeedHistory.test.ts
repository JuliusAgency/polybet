import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const seedFile = path.resolve(
  '/home/dmitriy/Projects/JuliusAgency/polybet/polybet/supabase/seed/003_betting_history.sql',
);

test('local seed includes a dedicated betting history SQL file', () => {
  assert.equal(existsSync(seedFile), true);
});

test('betting history seed inserts markets, outcomes, bets, transactions, logs, and sync runs', () => {
  const sql = readFileSync(seedFile, 'utf8');

  assert.match(sql, /INSERT INTO markets/i);
  assert.match(sql, /INSERT INTO market_outcomes/i);
  assert.match(sql, /INSERT INTO bets/i);
  assert.match(sql, /INSERT INTO balance_transactions/i);
  assert.match(sql, /INSERT INTO admin_action_logs/i);
  assert.match(sql, /INSERT INTO sync_runs/i);
  assert.match(sql, /UPDATE balances/i);
});

test('betting history seed provides open and resolved markets plus open and settled bets', () => {
  const sql = readFileSync(seedFile, 'utf8');

  assert.match(sql, /'open'/i);
  assert.match(sql, /'resolved'/i);
  assert.match(sql, /'won'/i);
  assert.match(sql, /'lost'/i);
  assert.match(sql, /'bet_lock'/i);
  assert.match(sql, /'bet_payout'/i);
});
