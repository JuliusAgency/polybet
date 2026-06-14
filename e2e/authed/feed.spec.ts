import { test, expect } from '../fixtures/authedTest';

// Authenticated baseline: a logged-in user1 (seeded by 002_test_users.sql,
// no markets/bets), so the feed renders with whatever real markets the
// stack has synced — or the "no markets" empty state when the DB has none.
// Either way the layout has to mount, the title has to show, and there
// must be no runtime errors.
//
// Once we add a deterministic markets fixture in tests-db, this spec gets
// stronger assertions (card count, specific event title, etc.).

test.describe('authed: markets feed', () => {
  test('signed-in user1 lands on /markets and the feed shell renders cleanly', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto('/markets');

    await expect(page).toHaveURL(/\/markets/);
    await expect(page.getByRole('heading', { name: /^markets$/i })).toBeVisible();

    // One of two valid terminal states:
    //   * empty seed → "No markets available"
    //   * synced data → at least one event/market card present
    // We accept both so the test isn't brittle on stack contents.
    const empty = page.getByText(/no markets available/i);
    const anyArticle = page.locator('article').first();
    await expect(empty.or(anyArticle)).toBeVisible({ timeout: 10_000 });

    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });
});
