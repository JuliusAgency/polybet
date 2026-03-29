import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const migrationFile = path.resolve('supabase/migrations/031_admin_report_datasets.sql');

test('admin report datasets migration exists', () => {
  assert.equal(existsSync(migrationFile), true);
});

test('admin report datasets migration defines super-admin report helpers', () => {
  const sql = readFileSync(migrationFile, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION admin_get_report_dataset\s*\(/i);
  assert.match(sql, /p_report_type text/i);
  assert.match(sql, /p_started_at timestamptz DEFAULT NULL/i);
  assert.match(sql, /p_ended_at timestamptz DEFAULT NULL/i);
  assert.match(sql, /p_manager_id uuid DEFAULT NULL/i);
  assert.match(sql, /p_user_id uuid DEFAULT NULL/i);
  assert.match(sql, /RETURNS jsonb/i);
  assert.match(sql, /IF NOT is_super_admin\s*\(\s*\) THEN/i);
  assert.match(sql, /RAISE EXCEPTION 'Access denied: super_admin required';/i);
  assert.match(sql, /CASE p_report_type/i);
  assert.match(sql, /WHEN 'system_summary'/i);
  assert.match(sql, /WHEN 'managers_performance'/i);
  assert.match(sql, /WHEN 'manager_detailed'/i);
  assert.match(sql, /WHEN 'user_statement'/i);
  assert.match(sql, /WHEN 'audit_actions'/i);
  assert.match(sql, /ELSE\s+RAISE EXCEPTION 'Unsupported report_type: %', p_report_type/i);
});

test('admin report datasets migration keeps dataset output deterministic and filter-aware', () => {
  const sql = readFileSync(migrationFile, 'utf8');

  const helpers = [
    'admin_build_system_summary_report_dataset',
    'admin_build_managers_performance_report_dataset',
    'admin_build_manager_detailed_report_dataset',
    'admin_build_user_statement_report_dataset',
    'admin_build_audit_actions_report_dataset',
  ];

  for (const helper of helpers) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION ${helper}\\s*\\(`, 'i'));
    assert.match(sql, new RegExp(`${helper}[\\s\\S]*?jsonb_build_object`, 'i'));
  }

  assert.match(sql, /jsonb_build_object\s*\(\s*'report_type',\s*p_report_type/i);
  assert.match(sql, /jsonb_build_object\s*\(\s*'started_at',\s*v_started_at/i);
  assert.match(sql, /'ended_at',\s*v_ended_at/i);
  assert.match(sql, /ORDER BY\s+m\.created_at,\s+m\.id/i);
  assert.match(sql, /ORDER BY\s+p\.created_at,\s+p\.id/i);
  assert.match(sql, /ORDER BY\s+b\.placed_at,\s+b\.id/i);
  assert.match(sql, /ORDER BY\s+bt\.created_at,\s+bt\.id/i);
  assert.match(sql, /ORDER BY\s+al\.created_at,\s+al\.id/i);
  assert.match(sql, /p_started_at IS NULL OR [^\n]+ >= p_started_at/i);
  assert.match(sql, /p_ended_at IS NULL OR [^\n]+ <= p_ended_at/i);
});
