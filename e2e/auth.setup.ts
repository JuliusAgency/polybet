import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_USERS, type TestUserKey } from './fixtures/users';
import { saveSessionStorage } from './fixtures/sessionStorage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Auth setup runs ONCE before the rest of the suite and persists a logged-in
// browser context for each role-tier we care about. Tests that opt into a
// storageState file then start already-authenticated, skipping the login
// form on every spec.
//
// We sign in through the real UI (not programmatic Supabase) so the
// storageState includes the auth cookie/localStorage shape that AuthProvider
// expects to hydrate on next load. Going via supabase-js directly and
// hand-rolling localStorage would diverge from production behaviour.

const STORAGE_DIR = path.resolve(__dirname, '.auth');

export function storageStatePath(role: TestUserKey): string {
  return path.join(STORAGE_DIR, `${role}.json`);
}

async function signInAs(page: import('@playwright/test').Page, role: TestUserKey) {
  const { username, password } = TEST_USERS[role];
  await page.goto('/sign-in');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  // The router redirects authenticated users away from /sign-in. We assert
  // on the URL change rather than a layout element, because each role lands
  // on a different default route (super_admin → /admin/dashboard, user → /markets).
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 15_000 });
}

setup('authenticate as user1', async ({ page }) => {
  await signInAs(page, 'user1');
  await expect(page).not.toHaveURL(/sign-in/);
  await page.context().storageState({ path: storageStatePath('user1') });
  // The Supabase session lives in sessionStorage (client.ts hardening), which
  // storageState() does NOT capture — snapshot it separately for authedTest.
  await saveSessionStorage(page, 'user1');
});

setup('authenticate as admin', async ({ page }) => {
  await signInAs(page, 'admin');
  await expect(page).not.toHaveURL(/sign-in/);
  await page.context().storageState({ path: storageStatePath('admin') });
  await saveSessionStorage(page, 'admin');
});

setup('authenticate as manager', async ({ page }) => {
  await signInAs(page, 'manager');
  await expect(page).not.toHaveURL(/sign-in/);
  await page.context().storageState({ path: storageStatePath('manager') });
  await saveSessionStorage(page, 'manager');
});
