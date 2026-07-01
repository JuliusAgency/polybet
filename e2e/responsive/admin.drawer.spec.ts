import { test as base, expect } from '@playwright/test';
import { readSessionStorage } from '../fixtures/sessionStorage';

// Real-browser regression for the super-admin mobile burger drawer: opening it
// from the top bar, picking a page, and confirming it BOTH navigates and
// auto-closes (the ticket's required behaviour, matching the Manager console).
//
// Runs in the `admin-responsive` project (admin storageState + testMatch
// /responsive/admin.*.spec.ts). The Supabase session lives in sessionStorage,
// so inject the captured snapshot like sweep.ts / fixtures/authedTest.ts do.
const test = base.extend({
  context: async ({ context }, provide) => {
    const entries = readSessionStorage('admin');
    await context.addInitScript((snapshot: Record<string, string>) => {
      for (const [key, value] of Object.entries(snapshot)) {
        window.sessionStorage.setItem(key, value);
      }
    }, entries);
    await provide(context);
  },
});

const MOBILE = { width: 375, height: 812 } as const;

test.describe('super-admin console — mobile drawer', () => {
  test.use({ viewport: MOBILE });

  test('burger opens the page list; picking a page navigates and auto-closes it', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/admin/dashboard');

    const burger = page.getByRole('button', { name: 'Menu' });
    const closeButton = page.getByRole('button', { name: 'Close' });
    const managersLink = page.getByRole('link', { name: 'Managers' });

    // Collapsed by default on mobile: only the burger. The desktop sidebar is
    // display:none below lg, so its nav link is not in the accessibility tree,
    // and the drawer (with its close button) is not mounted.
    await expect(burger).toBeVisible();
    await expect(closeButton).toBeHidden();
    await expect(managersLink).toBeHidden();

    // Open the drawer → the page list appears.
    await burger.click();
    await expect(burger).toHaveAttribute('aria-expanded', 'true');
    await expect(closeButton).toBeVisible();
    await expect(managersLink).toBeVisible();

    // Pick a page → it must navigate AND dismiss the drawer.
    await managersLink.click();
    await expect(page).toHaveURL(/\/admin\/managers/);
    await expect(closeButton).toBeHidden();
    await expect(burger).toHaveAttribute('aria-expanded', 'false');

    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });
});
