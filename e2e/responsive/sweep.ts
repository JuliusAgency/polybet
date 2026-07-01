import { test as base, expect } from '@playwright/test';
import { readSessionStorage } from '../fixtures/sessionStorage';
import type { TestUserKey } from '../fixtures/users';

export interface RouteCase {
  /** Short slug used in test titles and screenshot filenames. */
  label: string;
  /** Absolute app path to visit. */
  path: string;
}

// Mobile portrait, tablet portrait, tablet landscape — the three admin-relevant
// contexts. 375 is the iPhone-class floor; 768/1024 straddle the app's md/lg
// breakpoints where the sidebar and table→card transitions flip.
export const BREAKPOINTS = [
  { label: 'mobile-375', width: 375, height: 812 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'landscape-1024', width: 1024, height: 768 },
] as const;

// The app persists language under the i18next default localStorage key. Setting
// it before app code runs makes AuthProvider/RTLProvider boot in that language,
// so `SWEEP_LANG=he` exercises the whole admin surface in RTL (drawer edge,
// logical spacing, table alignment) — RTL overflow is a first-class regression.
const LANG = process.env.SWEEP_LANG ?? 'en';
const I18N_STORAGE_KEY = 'i18nextLng';

/**
 * Build an authenticated `test` for `role` (injecting the Supabase session that
 * auth.setup.ts captured into sessionStorage) and register a viewport sweep that,
 * for every route × breakpoint, asserts there is NO page-level horizontal
 * overflow and no uncaught runtime error, saving a full-page screenshot for the
 * independent reviewer to inspect.
 */
export function registerAdminSweep(role: TestUserKey, routes: RouteCase[]) {
  const test = base.extend({
    // Named `provide` (not `use`) so the react-hooks lint rule doesn't mistake
    // the fixture callback for React's `use` hook. Mirrors fixtures/authedTest.ts.
    context: async ({ context }, provide) => {
      const entries = readSessionStorage(role);
      await context.addInitScript((snapshot: Record<string, string>) => {
        for (const [key, value] of Object.entries(snapshot)) {
          window.sessionStorage.setItem(key, value);
        }
      }, entries);
      // Override the persisted language before app code runs so the sweep can
      // render the whole surface in RTL when SWEEP_LANG=he.
      await context.addInitScript(
        ({ key, lang }: { key: string; lang: string }) => {
          window.localStorage.setItem(key, lang);
        },
        { key: I18N_STORAGE_KEY, lang: LANG }
      );
      await provide(context);
    },
  });

  test.describe(`admin responsive sweep — ${role} [${LANG}]`, () => {
    for (const route of routes) {
      for (const bp of BREAKPOINTS) {
        test(`${route.label} @ ${bp.label} [${LANG}]`, async ({ page }, testInfo) => {
          const errors: string[] = [];
          page.on('pageerror', (e) => errors.push(e.message));

          await page.setViewportSize({ width: bp.width, height: bp.height });
          await page.goto(route.path);
          // Best-effort settle: admin pages fetch via TanStack Query. networkidle
          // may never fully resolve if something polls, so cap it and add a small
          // paint buffer rather than blocking the whole test on it.
          await page.waitForLoadState('networkidle').catch(() => {});
          await page.waitForTimeout(500);

          const metrics = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          }));

          const shot = `e2e/.artifacts/admin/${role}-${route.label}-${bp.label}-${LANG}.png`;
          await page.screenshot({ path: shot, fullPage: true });
          await testInfo.attach(`${role}-${route.label}-${bp.label}-${LANG}`, {
            path: shot,
            contentType: 'image/png',
          });

          expect(
            metrics.scrollWidth,
            `${route.path} @${bp.width}px: horizontal overflow — scrollWidth ${metrics.scrollWidth} > innerWidth ${metrics.innerWidth}`
          ).toBeLessThanOrEqual(metrics.innerWidth + 1);

          expect(
            errors,
            `runtime errors on ${route.path} @${bp.width}px:\n${errors.join('\n')}`
          ).toEqual([]);
        });
      }
    }
  });
}
