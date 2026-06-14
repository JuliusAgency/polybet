import { test as base, expect } from '@playwright/test';
import { readSessionStorage } from './sessionStorage';
import type { TestUserKey } from './users';

// Authenticated test base for the `user` project: replays the sessionStorage
// snapshot captured by auth.setup.ts into every new context BEFORE app code
// runs, so AuthProvider hydrates the Supabase session exactly like a real
// same-tab reload. Cookies/localStorage (i18n, theme) still come from the
// project-level storageState file.
const ROLE: TestUserKey = 'user1';

export const test = base.extend({
  context: async ({ context }, use) => {
    const entries = readSessionStorage(ROLE);
    await context.addInitScript((snapshot: Record<string, string>) => {
      for (const [key, value] of Object.entries(snapshot)) {
        window.sessionStorage.setItem(key, value);
      }
    }, entries);
    await use(context);
  },
});

export { expect };
