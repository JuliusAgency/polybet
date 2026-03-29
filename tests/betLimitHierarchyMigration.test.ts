import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const migrationFile = path.resolve('supabase/migrations/030_bet_limit_hierarchy.sql');

test('bet limit hierarchy migration exists', () => {
  assert.equal(existsSync(migrationFile), true);
});

test('bet limit hierarchy migration seeds global bet limits and resolves precedence', () => {
  const sql = readFileSync(migrationFile, 'utf8');

  assert.match(sql, /ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_bet_limit numeric;/i);
  assert.match(sql, /INSERT INTO system_settings\s*\(key,\s*value\)\s*VALUES\s*\(\s*'bet_limits'/i);
  assert.match(sql, /jsonb_build_object\s*\(\s*'global_max_bet'/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION resolve_effective_max_bet_limit\s*\(\s*p_user_id uuid\s*\)/i);
  assert.match(sql, /RETURNS TABLE\s*\(\s*effective_limit numeric,\s*source text\s*\)/i);
  assert.match(sql, /p\.max_bet_limit/i);
  assert.match(sql, /m\.max_bet_limit/i);
  assert.match(sql, /system_settings/i);
  assert.match(sql, /COALESCE\s*\(\s*\(\s*SELECT\s*\(\s*value\s*->>\s*'global_max_bet'\s*\)::numeric/i);
  assert.match(sql, /NULLIF\s*\(\s*GREATEST\s*\(\s*COALESCE\s*\(\s*p\.max_bet_limit,\s*0\s*\),\s*0\s*\),\s*0\s*\)/i);
  assert.match(sql, /NULLIF\s*\(\s*GREATEST\s*\(\s*COALESCE\s*\(\s*m\.max_bet_limit,\s*0\s*\),\s*0\s*\),\s*0\s*\)/i);
  assert.match(sql, /'user'::text/i);
  assert.match(sql, /'manager'::text/i);
  assert.match(sql, /'global'::text/i);
});

test('bet limit hierarchy migration wires effective limit enforcement into place_bet', () => {
  const sql = readFileSync(migrationFile, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION place_bet\s*\(/i);
  assert.match(sql, /FROM resolve_effective_max_bet_limit\s*\(\s*v_user_id\s*\)/i);
  assert.match(sql, /p_stake\s*>\s*v_effective_limit/i);
  assert.match(sql, /RAISE EXCEPTION 'Stake exceeds effective maximum bet limit';/i);
});

test('bet limit hierarchy migration adds super admin bet limit RPCs with action logging', () => {
  const sql = readFileSync(migrationFile, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION admin_set_global_max_bet_limit\s*\(\s*p_value numeric\s*\)/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION admin_set_manager_max_bet_limit\s*\(\s*p_manager_id uuid,\s*p_value numeric\s*\)/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION admin_set_user_max_bet_limit\s*\(\s*p_user_id uuid,\s*p_value numeric\s*\)/i);

  const functions = [
    'admin_set_global_max_bet_limit',
    'admin_set_manager_max_bet_limit',
    'admin_set_user_max_bet_limit',
  ];

  for (const functionName of functions) {
    const pattern = new RegExp(
      `CREATE OR REPLACE FUNCTION ${functionName}[\\s\\S]*?IF NOT is_super_admin\\s*\\(\\s*\\) THEN[\\s\\S]*?INSERT INTO admin_action_logs`,
      'i',
    );

    assert.match(sql, pattern);
  }
});
