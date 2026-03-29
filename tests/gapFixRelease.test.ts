import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/home/dmitriy/Projects/JuliusAgency/polybet/polybet';
const migrationFile = path.join(projectRoot, 'supabase/migrations/027_market_archive_and_kpis.sql');
const routesFile = path.join(projectRoot, 'src/app/router/routes.ts');
const routerFile = path.join(projectRoot, 'src/app/router/Router.tsx');
const userLayoutFile = path.join(projectRoot, 'src/app/layouts/UserLayout/UserLayout.tsx');

test('gap-fix migration exists and defines archive lifecycle + idempotency indexes', () => {
  assert.equal(existsSync(migrationFile), true);

  const sql = readFileSync(migrationFile, 'utf8');
  assert.match(sql, /status IN \('open', 'closed', 'resolved', 'archived'\)/);
  assert.match(sql, /archive_after_hours/);
  assert.match(sql, /uq_bet_settlement_logs_bet_id/);
  assert.match(sql, /uq_balance_transactions_bet_lock/);
  assert.match(sql, /uq_balance_transactions_bet_payout/);
  assert.match(sql, /ON CONFLICT \(bet_id\) DO NOTHING/);
  assert.match(sql, /CREATE OR REPLACE VIEW system_kpis/);
  assert.match(sql, /CREATE OR REPLACE VIEW manager_group_metrics/);
});

test('user stats route is registered in route constants and router tree', () => {
  const routes = readFileSync(routesFile, 'utf8');
  const router = readFileSync(routerFile, 'utf8');

  assert.match(routes, /STATS:\s*'\/stats'/);
  assert.match(router, /const StatsPage = lazy\(\(\) => import\('@\/pages\/user\/StatsPage'\)\);/);
  assert.match(router, /<Route path="stats" element={<StatsPage \/>} \/>/);
});

test('manager treasury route is wired to the dedicated TreasuryPage component module', () => {
  const router = readFileSync(routerFile, 'utf8');

  const hasEagerImport = /import TreasuryPage from '@\/pages\/manager\/TreasuryPage\/TreasuryPage';/.test(router);
  const hasLazyImport = /const TreasuryPage = lazy\(\(\) => import\('@\/pages\/manager\/TreasuryPage\/TreasuryPage'\)\);/.test(router);
  assert.equal(hasEagerImport || hasLazyImport, true);
  assert.match(router, /<Route path="treasury" element={<TreasuryPage \/>} \/>/);
});

test('user layout navigation includes the stats item', () => {
  const source = readFileSync(userLayoutFile, 'utf8');

  assert.match(source, /to={ROUTES\.USER\.STATS}/);
  assert.match(source, /t\('nav\.stats'\)/);
});
