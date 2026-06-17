import { test, expect } from '../fixtures/authedTest';
import type { Page } from '@playwright/test';

// Visual check for the World Cup hero flag-wheel tilt in LTR vs RTL.
// Regression target: in Hebrew the wheel must be a true horizontal mirror of
// the LTR hero (scaleX(-1) + counter-flipped flag content), NOT the same rigid
// disk repositioned to the left — which would expose the opposite flank and
// render the flags with an inverted tilt. We screenshot the hero in both
// directions so the mirror can be eyeballed from the artifacts.

const ARTIFACT_DIR = 'e2e/.artifacts';

// Force the UI language (i18next persists to localStorage), reload so the
// document dir + chip labels settle, then open the World Cup tab and wait for
// the hero wheel to mount.
async function openWorldCup(page: Page, lang: 'en' | 'he') {
  await page.goto('/markets');
  await page.evaluate((l) => window.localStorage.setItem('i18nextLng', l), lang);
  await page.reload();

  const chip = page.getByRole('button', { name: /world cup|גביע העולם/i }).first();
  await expect(chip).toBeVisible();
  await chip.click();

  await expect(page.locator('.wc-hero')).toBeVisible();
  // Let the wheel mount + one rAF tick settle.
  await page.waitForTimeout(500);
}

test.describe('authed: World Cup hero RTL mirror', () => {
  test('hero renders in LTR and mirrored RTL', async ({ page }) => {
    const errors: string[] = [];
    // Ignore noise unrelated to the hero: external resources that don't resolve
    // inside the sandboxed test network. The duplicate-React-key warning is
    // intentionally NOT ignored — the hero de-dupes countries by flag code, so
    // a regression there should fail this spec.
    const isUnrelated = (msg: string) => /ERR_NAME_NOT_RESOLVED|Failed to load resource/i.test(msg);
    page.on('pageerror', (e) => {
      if (!isUnrelated(e.message)) errors.push(e.message);
    });
    page.on('console', (m) => {
      if (m.type() === 'error' && !isUnrelated(m.text())) errors.push(m.text());
    });

    // --- LTR (English) ---
    await openWorldCup(page, 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.locator('.wc-hero').screenshot({ path: `${ARTIFACT_DIR}/wc-hero-ltr.png` });

    // --- RTL (Hebrew) ---
    await openWorldCup(page, 'he');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // The wheel layer must carry the scaleX(-1) mirror in RTL.
    const transform = await page
      .locator('.wc-hero__wheel-layer')
      .evaluate((el) => getComputedStyle(el).transform);
    // matrix(a, ...) where a (the [0][0] entry) is negative => scaleX(-1) applied.
    const a = Number(transform.replace(/^matrix\(([^,]+),.*$/, '$1'));
    expect(a, `wheel-layer transform: ${transform}`).toBeLessThan(0);

    await page.locator('.wc-hero').screenshot({ path: `${ARTIFACT_DIR}/wc-hero-rtl.png` });

    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });
});
