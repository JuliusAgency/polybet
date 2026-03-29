# Market Summary Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared market summary rendering for all roles by expanding the user market cards and introducing dedicated read-only market pages for manager and super admin.

**Architecture:** Reuse the existing Supabase `markets` + `market_outcomes` read path and generalize it into a shared market-summary query contract. Build one reusable market summary card with role modes (`interactive` for user, `readonly` for manager/admin), then mount it on new manager and super-admin pages through role-specific routes and navigation.

**Tech Stack:** React 19, TypeScript, TanStack Query, React Router, Supabase JS, i18next, Node `tsx --test` file-content tests.

---

## File Structure

**Existing files to modify**
- `src/features/bet/useMarkets.ts`
- `src/features/bet/index.ts`
- `src/pages/user/MarketsFeedPage/components/MarketCard/MarketCard.tsx`
- `src/pages/user/MarketsFeedPage/MarketsFeedPage.tsx`
- `src/app/router/routes.ts`
- `src/app/router/Router.tsx`
- `src/app/layouts/ManagerLayout/ManagerLayout.tsx`
- `src/app/layouts/SuperAdminLayout/SuperAdminLayout.tsx`
- `src/shared/i18n/locales/en/translation.json`
- `src/shared/i18n/locales/he/translation.json`

**New files to create**
- `src/pages/manager/MarketsPage/MarketsPage.tsx`
- `src/pages/manager/MarketsPage/index.ts`
- `src/pages/super-admin/MarketsPage/MarketsPage.tsx`
- `src/pages/super-admin/MarketsPage/index.ts`
- `tests/marketsSummaryQuery.test.ts`
- `tests/marketSummaryCardFields.test.ts`
- `tests/managerAdminMarketsRoutes.test.ts`

This plan intentionally does not introduce a new backend API layer. It keeps the current frontend-driven Supabase query and extends it only if existing table reads are sufficient for all three roles.

---

### Task 1: Expand The Shared Market Query Contract

**Files:**
- Modify: `src/features/bet/useMarkets.ts`
- Modify: `src/features/bet/index.ts`
- Test: `tests/marketsSummaryQuery.test.ts`

- [ ] **Step 1: Write the failing query contract test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('useMarkets selects all market summary and outcome update fields', () => {
  const source = fs.readFileSync('src/features/bet/useMarkets.ts', 'utf8');

  assert.match(source, /polymarket_id/);
  assert.match(source, /question/);
  assert.match(source, /category/);
  assert.match(source, /close_at/);
  assert.match(source, /status/);
  assert.match(source, /market_outcomes[^']*updated_at/);
  assert.match(source, /\.in\('status', \['open', 'closed', 'resolved'\]\)/);
});
```

- [ ] **Step 2: Run the test and verify FAIL**

Run: `npm test -- tests/marketsSummaryQuery.test.ts`
Expected: FAIL because `updated_at` is not selected yet and the query contract does not fully match the summary spec.

- [ ] **Step 3: Implement the minimal query/type update**

- Extend `MarketOutcome` with `updated_at: string`.
- Keep current summary-relevant market fields in `Market`.
- Add `updated_at` to the nested `market_outcomes` selection.
- Re-export any updated types from `src/features/bet/index.ts`.
- Do not rename the hook yet unless implementation clearly benefits from it; prefer minimal change.

- [ ] **Step 4: Run targeted and full tests**

Run: `npm test -- tests/marketsSummaryQuery.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS, or only unrelated pre-existing failures.

- [ ] **Step 5: Commit**

```bash
git add src/features/bet/useMarkets.ts src/features/bet/index.ts tests/marketsSummaryQuery.test.ts
git commit -m "feat(markets): extend market summary query contract"
```

---

### Task 2: Upgrade The Shared Market Card For Summary Mode

**Files:**
- Modify: `src/pages/user/MarketsFeedPage/components/MarketCard/MarketCard.tsx`
- Modify: `src/pages/user/MarketsFeedPage/MarketsFeedPage.tsx`
- Test: `tests/marketSummaryCardFields.test.ts`

- [ ] **Step 1: Write the failing component contract test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('MarketCard renders market IDs, status, and outcome summary fields', () => {
  const source = fs.readFileSync('src/pages/user/MarketsFeedPage/components/MarketCard/MarketCard.tsx', 'utf8');

  assert.match(source, /market\.id/);
  assert.match(source, /market\.polymarket_id/);
  assert.match(source, /market\.question/);
  assert.match(source, /market\.category/);
  assert.match(source, /market\.close_at/);
  assert.match(source, /outcome\.effective_odds/);
  assert.match(source, /outcome\.updated_at/);
});
```

- [ ] **Step 2: Run the test and verify FAIL**

Run: `npm test -- tests/marketSummaryCardFields.test.ts`
Expected: FAIL because the card does not currently render IDs or outcome update timestamps.

- [ ] **Step 3: Implement the minimal summary card upgrade**

- Add a display mode prop to `MarketCard`, e.g. `mode: 'interactive' | 'readonly'`.
- Keep current user interaction behavior when mode is `interactive`.
- Render:
  - internal market ID
  - Polymarket ID
  - question
  - category when present
  - close date when present
  - uppercase market status
  - per-outcome name
  - current odds
  - effective odds only when different from current odds
  - outcome updated time
- In `MarketsFeedPage`, pass `mode="interactive"` and keep the bet slip flow unchanged.

- [ ] **Step 4: Run targeted and full tests**

Run: `npm test -- tests/marketSummaryCardFields.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS, or only unrelated pre-existing failures.

- [ ] **Step 5: Commit**

```bash
git add src/pages/user/MarketsFeedPage/components/MarketCard/MarketCard.tsx src/pages/user/MarketsFeedPage/MarketsFeedPage.tsx tests/marketSummaryCardFields.test.ts
git commit -m "feat(markets): render shared market summary fields"
```

---

### Task 3: Add Manager And Super Admin Market Pages

**Files:**
- Create: `src/pages/manager/MarketsPage/MarketsPage.tsx`
- Create: `src/pages/manager/MarketsPage/index.ts`
- Create: `src/pages/super-admin/MarketsPage/MarketsPage.tsx`
- Create: `src/pages/super-admin/MarketsPage/index.ts`
- Modify: `src/app/router/routes.ts`
- Modify: `src/app/router/Router.tsx`
- Modify: `src/app/layouts/ManagerLayout/ManagerLayout.tsx`
- Modify: `src/app/layouts/SuperAdminLayout/SuperAdminLayout.tsx`
- Test: `tests/managerAdminMarketsRoutes.test.ts`

- [ ] **Step 1: Write the failing route/navigation test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('manager and admin layouts expose dedicated markets routes', () => {
  const routes = fs.readFileSync('src/app/router/routes.ts', 'utf8');
  const router = fs.readFileSync('src/app/router/Router.tsx', 'utf8');
  const managerLayout = fs.readFileSync('src/app/layouts/ManagerLayout/ManagerLayout.tsx', 'utf8');
  const adminLayout = fs.readFileSync('src/app/layouts/SuperAdminLayout/SuperAdminLayout.tsx', 'utf8');

  assert.match(routes, /MARKETS/);
  assert.match(router, /MarketsPage/);
  assert.match(managerLayout, /nav\.markets/);
  assert.match(adminLayout, /nav\.markets/);
});
```

- [ ] **Step 2: Run the test and verify FAIL**

Run: `npm test -- tests/managerAdminMarketsRoutes.test.ts`
Expected: FAIL because the routes, pages, and nav items do not exist yet.

- [ ] **Step 3: Implement the new pages and routing**

- Create a manager markets page that:
  - calls `useMarkets`
  - renders the shared `MarketCard` in `readonly` mode
  - handles loading, error, and empty states
- Create a super-admin markets page with the same structure
- Add route constants for manager/admin markets pages
- Register both pages in `Router.tsx`
- Add nav links in manager and super-admin layouts
- Keep the new pages read-only: no bet slip, no outcome click action

- [ ] **Step 4: Run targeted and full tests**

Run: `npm test -- tests/managerAdminMarketsRoutes.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS, or only unrelated pre-existing failures.

- [ ] **Step 5: Commit**

```bash
git add src/pages/manager/MarketsPage src/pages/super-admin/MarketsPage src/app/router/routes.ts src/app/router/Router.tsx src/app/layouts/ManagerLayout/ManagerLayout.tsx src/app/layouts/SuperAdminLayout/SuperAdminLayout.tsx tests/managerAdminMarketsRoutes.test.ts
git commit -m "feat(markets): add manager and admin market overview pages"
```

---

### Task 4: Add Translations And Final Verification

**Files:**
- Modify: `src/shared/i18n/locales/en/translation.json`
- Modify: `src/shared/i18n/locales/he/translation.json`
- Modify: any files from prior tasks only if required for text key alignment

- [ ] **Step 1: Write the failing translation assertions by extending existing tests**

Append assertions to `tests/marketSummaryCardFields.test.ts` or create a focused text-surface test so it checks for translation keys covering:

```ts
assert.match(en, /"markets"/);
assert.match(en, /"source"/);
assert.match(en, /"updatedAt"/);
assert.match(en, /"status"/);
assert.match(en, /"probability"/);
assert.match(en, /"finalOutcome"/);
assert.match(en, /"nav"/);
assert.match(en, /"markets"/);
```

Also verify the Hebrew locale carries any newly added keys for manager/admin market navigation or summary labels.

- [ ] **Step 2: Run the targeted test and verify FAIL**

Run: `npm test -- tests/marketSummaryCardFields.test.ts`
Expected: FAIL if new keys required by the pages/layouts are still missing.

- [ ] **Step 3: Implement minimal i18n updates**

- Add any missing `nav.markets` usage for manager/admin layouts if not already reusable.
- Add any missing market summary labels needed by the richer card.
- Keep wording concise and aligned with existing tone in English and Hebrew locales.

- [ ] **Step 4: Run verification**

Run: `npm test`
Expected: PASS, or only unrelated pre-existing failures.

Run: `npm run build`
Expected: successful TypeScript + Vite build.

- [ ] **Step 5: Commit**

```bash
git add src/shared/i18n/locales/en/translation.json src/shared/i18n/locales/he/translation.json tests/marketSummaryCardFields.test.ts
git commit -m "chore(markets): finalize market summary labels and verification"
```

---

## Notes For Implementation

- Prefer reusing the existing `MarketCard` path instead of a premature component move unless file size becomes a real problem during implementation.
- Keep manager/admin pages visually consistent with the current user markets grid unless an existing admin layout pattern strongly suggests otherwise.
- Do not add backend complexity unless role access to `markets` / `market_outcomes` actually fails during implementation.
- If `readonly` mode is implemented by making `onOutcomeClick` optional, tests should verify that no clickable bet path is rendered for manager/admin pages.

---

## Final Verification Checklist

- [ ] User market cards show internal ID, Polymarket ID, category, close date, uppercase status, and outcome update time.
- [ ] User can still click an outcome and place a bet from the existing markets page.
- [ ] Manager has a dedicated markets overview page with read-only cards.
- [ ] Super admin has a dedicated markets overview page with read-only cards.
- [ ] Shared query selects `updated_at` for nested outcomes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
