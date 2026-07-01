import { test, expect } from '../fixtures/authedTest';

// Regression for the mobile "In Game Balance" (In-Play) drawer:
//   * The drawer opened but could not be closed on a phone — its × was hidden
//     under the sticky header and the full-width panel covered the backdrop.
//   * Re-tapping the In-Play amount did nothing (the handler only ever opened
//     it), and the PolyBet logo appeared dead because the drawer overlay stayed
//     mounted over the home page after navigation.
//
// These run in the `user` project (logged-in user1). user1 seeds a balance, so
// the In-Play control renders even with zero open bets (empty-state drawer).

// Accessible names (English locale, from wallet.inPlay / the drawer markup).
const IN_PLAY = 'In-Play Balance'; // header button aria-label AND drawer <h2>
const CLOSE = 'Close'; // drawer × aria-label
const LOGO = 'PolyBet'; // header logo link

// iPhone-class portrait viewport, matching the reported device.
const MOBILE = { width: 390, height: 844 } as const;

test.describe('authed: In-Play drawer (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('re-tapping the In-Play amount toggles the drawer closed', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto('/markets');

    const inPlayButton = page.getByRole('button', { name: IN_PLAY });
    const drawerHeading = page.getByRole('heading', { name: IN_PLAY });

    await expect(inPlayButton).toBeVisible();
    await expect(inPlayButton).toHaveAttribute('aria-expanded', 'false');
    await expect(drawerHeading).toBeHidden();

    // Open.
    await inPlayButton.click();
    await expect(drawerHeading).toBeVisible();
    await expect(inPlayButton).toHaveAttribute('aria-expanded', 'true');

    // Re-tap the same amount → closes (the ticket's required behaviour).
    await inPlayButton.click();
    await expect(drawerHeading).toBeHidden();
    await expect(inPlayButton).toHaveAttribute('aria-expanded', 'false');

    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('the × button closes the drawer on mobile (not occluded by the header)', async ({
    page,
  }) => {
    await page.goto('/markets');

    const inPlayButton = page.getByRole('button', { name: IN_PLAY });
    const drawerHeading = page.getByRole('heading', { name: IN_PLAY });

    await inPlayButton.click();
    await expect(drawerHeading).toBeVisible();

    // A real tap (Playwright enforces actionability: the target must actually
    // receive the pointer event). If the header still covered the ×, this would
    // time out — which is exactly the bug this asserts is fixed.
    await page.getByRole('button', { name: CLOSE }).click();
    await expect(drawerHeading).toBeHidden();
  });

  test('the logo returns to the home feed and dismisses the open drawer', async ({ page }) => {
    // Start off the home route so navigation is observable.
    await page.goto('/wallet');
    await expect(page).toHaveURL(/\/wallet/);

    const inPlayButton = page.getByRole('button', { name: IN_PLAY });
    const drawerHeading = page.getByRole('heading', { name: IN_PLAY });

    await inPlayButton.click();
    await expect(drawerHeading).toBeVisible();

    // Tap the logo while the drawer is open.
    await page.getByRole('link', { name: LOGO }).click();

    // It must both navigate home AND leave no overlay masking the page.
    await expect(page).toHaveURL(/\/markets/);
    await expect(drawerHeading).toBeHidden();
    await expect(inPlayButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('tapping the logo while already on home still dismisses the drawer', async ({ page }) => {
    // The path does not change here, so the route-change guard never fires — this
    // exercises the logo's explicit onClick close branch specifically.
    await page.goto('/markets');

    const inPlayButton = page.getByRole('button', { name: IN_PLAY });
    const drawerHeading = page.getByRole('heading', { name: IN_PLAY });

    await inPlayButton.click();
    await expect(drawerHeading).toBeVisible();

    await page.getByRole('link', { name: LOGO }).click();

    await expect(page).toHaveURL(/\/markets/);
    await expect(drawerHeading).toBeHidden();
    await expect(inPlayButton).toHaveAttribute('aria-expanded', 'false');
  });
});
