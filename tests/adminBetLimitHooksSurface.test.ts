import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

test('admin bet limit hooks surface exports the query and mutation hooks', async () => {
  const featureDir = path.resolve('src/features/admin/bet-limits');
  const indexFile = path.join(featureDir, 'index.ts');

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
});
