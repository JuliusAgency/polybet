import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

test('admin bet limit hooks surface exports the query and mutation hooks', async () => {
  const featureDir = path.resolve('src/features/admin/bet-limits');
  const indexFile = path.join(featureDir, 'index.ts');
  const queryHookFile = path.join(featureDir, 'useBetLimitSettings.ts');

  assert.equal(existsSync(path.join(featureDir, 'useBetLimitSettings.ts')), true);
  assert.equal(existsSync(path.join(featureDir, 'useSetGlobalBetLimit.ts')), true);
  assert.equal(existsSync(path.join(featureDir, 'useSetManagerBetLimit.ts')), true);
  assert.equal(existsSync(path.join(featureDir, 'useSetUserBetLimit.ts')), true);
  assert.equal(existsSync(indexFile), true);

  const indexSource = readFileSync(indexFile, 'utf8');

  assert.match(indexSource, /export\s*\{\s*useBetLimitSettings\b/);
  assert.match(indexSource, /export\s*\{\s*useSetGlobalBetLimit\b/);
  assert.match(indexSource, /export\s*\{\s*useSetManagerBetLimit\b/);
  assert.match(indexSource, /export\s*\{\s*useSetUserBetLimit\b/);

  const queryHookSource = readFileSync(queryHookFile, 'utf8');

  assert.match(queryHookSource, /Math\.min\s*\(/);
  assert.match(queryHookSource, /managerFloorByUserId/);
  assert.match(queryHookSource, /select\('user_id,\s*manager_id'\)/);
  assert.match(
    queryHookSource,
    /deriveUserEffectiveLimit\([\s\S]*managerFloorByUserId\.get\(user\.userId\)\s*\?\?\s*null,[\s\S]*globalMaxBetLimit[\s\S]*\)/,
  );
  assert.doesNotMatch(
    queryHookSource,
    /deriveUserEffectiveLimit\(user,\s*manager\?\.maxBetLimit\s*\?\?\s*null,\s*globalMaxBetLimit\)/,
  );
});
