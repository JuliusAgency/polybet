import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const authProviderFile = path.resolve('src/app/providers/AuthProvider/AuthProvider.tsx');

test('auth provider sign-out flow falls back to local scope and clears local auth state', () => {
  const source = readFileSync(authProviderFile, 'utf8');

  assert.match(source, /const\s+clearAuthState\s*=\s*useCallback\s*\(\s*\(\)\s*=>\s*\{/i);
  assert.match(source, /setSession\(null\)/i);
  assert.match(source, /setUser\(null\)/i);
  assert.match(source, /setProfile\(null\)/i);
  assert.match(source, /setRole\(null\)/i);

  assert.match(source, /const\s+globalResult\s*=\s*await\s+supabase\.auth\.signOut\s*\(\s*\{\s*scope:\s*'global'\s*\}\s*\)/i);
  assert.match(source, /const\s+localResult\s*=\s*await\s+supabase\.auth\.signOut\s*\(\s*\{\s*scope:\s*'local'\s*\}\s*\)/i);
  assert.match(source, /const\s+signOut\s*=\s*useCallback\s*\(\s*async\s*\(\)\s*=>\s*\{\s*await\s+forceSignOut\(\)/i);
});
