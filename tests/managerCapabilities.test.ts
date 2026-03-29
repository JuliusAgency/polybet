import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/home/dmitriy/Projects/JuliusAgency/polybet';
const appRoot = path.join(projectRoot, 'polybet');

const usersPageFile = path.join(appRoot, 'src/pages/manager/UsersManagementPage/UsersManagementPage.tsx');
const usersFeatureIndexFile = path.join(appRoot, 'src/features/manager/users/index.ts');
const enLocaleFile = path.join(appRoot, 'src/shared/i18n/locales/en/translation.json');
const heLocaleFile = path.join(appRoot, 'src/shared/i18n/locales/he/translation.json');
const codexContextFile = path.join(projectRoot, 'CODEX.md');
const managerToggleMigrationFile = path.join(
  appRoot,
  'supabase/migrations/026_manager_user_blocking.sql',
);

test('manager users page exposes action controls for block and unblock', () => {
  const source = readFileSync(usersPageFile, 'utf8');

  assert.match(source, /t\('managerProfile\.actions'\)/);
  assert.match(source, /t\('managerProfile\.block'\)/);
  assert.match(source, /t\('managerProfile\.unblock'\)/);
});

test('manager users feature exports a manager block toggle hook', () => {
  const source = readFileSync(usersFeatureIndexFile, 'utf8');

  assert.match(source, /useManagerToggleUserBlock/);
});

test('manager block migration exists and logs actions through a dedicated RPC', () => {
  assert.equal(existsSync(managerToggleMigrationFile), true);

  const sql = readFileSync(managerToggleMigrationFile, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION manager_toggle_user_block/i);
  assert.match(sql, /INSERT INTO admin_action_logs/i);
  assert.match(sql, /manager required/i);
  assert.match(sql, /manager_user_links/i);
});

test('root codex context file exists for future session bootstrapping', () => {
  assert.equal(existsSync(codexContextFile), true);
});

test('manager-facing strings for user actions are present in both locales', () => {
  const en = readFileSync(enLocaleFile, 'utf8');
  const he = readFileSync(heLocaleFile, 'utf8');

  assert.match(en, /"actions":\s*"Actions"/);
  assert.match(he, /"actions":\s*".+?"/);
  assert.match(en, /"block":\s*"Block"/);
  assert.match(he, /"block":\s*".+?"/);
  assert.match(en, /"unblock":\s*"Unblock"/);
  assert.match(he, /"unblock":\s*".+?"/);
});
