import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSeedCatalog,
  collectCleanupTargets,
  evaluateVerification,
} from '../scripts/prodDemoSeed.ts';

test('buildSeedCatalog namespaces demo fixtures and covers the required roles and markets', () => {
  const catalog = buildSeedCatalog('prod_demo_v1');

  assert.equal(catalog.managers.length, 2);
  assert.equal(catalog.users.length, 5);
  assert.equal(catalog.markets.length, 4);
  assert.ok(catalog.markets.some((market) => market.kind === 'open_manual'));
  assert.ok(catalog.markets.some((market) => market.kind === 'open_seeded'));
  assert.ok(catalog.markets.some((market) => market.kind === 'resolved_primary'));
  assert.ok(catalog.markets.some((market) => market.kind === 'resolved_secondary'));

  for (const actor of [...catalog.managers, ...catalog.users]) {
    assert.match(actor.username, /^demo_prod_demo_v1_/);
    assert.match(actor.email, /^demo_prod_demo_v1_/);
    assert.match(actor.notes, /^seed:prod_demo_v1:/);
  }

  for (const market of catalog.markets) {
    assert.match(market.polymarketId, /^demo:prod_demo_v1:/);
    assert.match(market.slug, /^demo-prod-demo-v1-/);
    assert.match(market.question, /^\[DEMO\]/);
  }
});

test('collectCleanupTargets only returns namespace-scoped demo rows', () => {
  const targets = collectCleanupTargets('prod_demo_v1', {
    profiles: [
      {
        id: 'profile-demo-1',
        username: 'demo_prod_demo_v1_manager_alpha',
        email: 'demo_prod_demo_v1_manager_alpha@polybet.internal',
        notes: 'seed:prod_demo_v1:manager:alpha',
      },
      {
        id: 'profile-real-1',
        username: 'manager_real',
        email: 'manager_real@polybet.internal',
        notes: 'handmade',
      },
    ],
    markets: [
      {
        id: 'market-demo-1',
        polymarket_id: 'demo:prod_demo_v1:open:manual',
        polymarket_slug: 'demo-prod-demo-v1-open-manual',
        question: '[DEMO] Manual bet market',
      },
      {
        id: 'market-real-1',
        polymarket_id: '0x-real-market',
        polymarket_slug: 'real-market',
        question: 'Real market',
      },
    ],
    syncRuns: [
      { id: 'run-demo-1', phase: 'demo_seeded' },
      { id: 'run-real-1', phase: 'completed' },
    ],
  });

  assert.deepEqual(targets.profileIds, ['profile-demo-1']);
  assert.deepEqual(targets.marketIds, ['market-demo-1']);
  assert.deepEqual(targets.syncRunIds, ['run-demo-1']);
  assert.deepEqual(targets.profileEmails, ['demo_prod_demo_v1_manager_alpha@polybet.internal']);
});

test('evaluateVerification requires demo coverage and treats live visible markets as a warning', () => {
  const okReport = evaluateVerification({
    superAdminId: 'admin-1',
    managerCount: 2,
    userCount: 5,
    linkedUserCount: 5,
    demoMarketCounts: {
      openManual: 1,
      openSeeded: 1,
      resolved: 2,
    },
    betCounts: {
      open: 2,
      settled: 4,
    },
    transactionCount: 8,
    actionLogCount: 3,
    syncRunCount: 1,
    liveVisibleMarketCount: 0,
  });

  assert.equal(okReport.ok, true);
  assert.deepEqual(okReport.errors, []);
  assert.match(okReport.warnings[0] ?? '', /No live visible markets/);

  const failedReport = evaluateVerification({
    superAdminId: null,
    managerCount: 1,
    userCount: 4,
    linkedUserCount: 3,
    demoMarketCounts: {
      openManual: 0,
      openSeeded: 1,
      resolved: 0,
    },
    betCounts: {
      open: 0,
      settled: 1,
    },
    transactionCount: 1,
    actionLogCount: 0,
    syncRunCount: 0,
    liveVisibleMarketCount: 2,
  });

  assert.equal(failedReport.ok, false);
  assert.ok(failedReport.errors.some((error) => error.includes('super_admin')));
  assert.ok(failedReport.errors.some((error) => error.includes('at least 2 demo managers')));
  assert.ok(failedReport.errors.some((error) => error.includes('at least 5 demo users')));
  assert.ok(failedReport.errors.some((error) => error.includes('manual betting')));
  assert.ok(failedReport.errors.some((error) => error.includes('resolved market')));
});
