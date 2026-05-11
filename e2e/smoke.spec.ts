import { test, expect } from '@playwright/test';

// Smoke tier: validates the bootstrap path end-to-end without exercising
// auth, Supabase data fetches, or business flows. If this fails, something
// fundamental is broken — Vite isn't serving, the React tree won't mount,
// or the router can't reach the public sign-in screen. Anything richer
// (login, place-bet) layers on top of this passing.

test.describe('smoke', () => {
  test('app boots and unauthenticated visit reaches the sign-in screen', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');

    // Router uses <Navigate> when no auth — landing or '/' should redirect
    // to /sign-in. We assert on the visible heading so failure surfaces a
    // useful diff, not just a URL mismatch.
    await expect(page.getByRole('heading', { name: /sign in to polybet/i })).toBeVisible();

    // Username + password inputs and the submit button must all render.
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();

    expect(consoleErrors, `unexpected runtime errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
