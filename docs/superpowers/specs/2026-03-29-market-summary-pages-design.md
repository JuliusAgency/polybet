# Market Summary Pages — Design Spec

**Date:** 2026-03-29
**Status:** Approved

---

## Problem

The system already stores enough market and outcome data to present a structured
market summary, but that summary exists only partially and only for the user
betting flow.

Current gaps:

1. `user` sees market cards on the betting page, but those cards do not expose
   the full market summary required by the product.
2. `manager` has no dedicated page that lists all markets in the system.
3. `super_admin` has no dedicated page that lists all markets in the system.
4. The market summary contract is not centralized, so role-specific pages would
   likely drift if implemented independently.

---

## Goals

1. Show a complete market summary in the existing user markets flow.
2. Add dedicated read-only market pages for `manager` and `super_admin`.
3. Use one shared data/query contract and one shared summary UI to avoid
   duplicated logic.
4. Display the following market-level fields:
   - internal ID
   - Polymarket ID
   - question
   - category
   - close date
   - status (`OPEN`, `CLOSED`, `RESOLVED`)
   - outcomes list
5. Display the following outcome-level fields:
   - name
   - current odds
   - effective odds, if margin applies
   - update timestamp

---

## Non-Goals

1. No change to bet placement rules or settlement logic.
2. No new backend API/RPC layer unless read access from existing Supabase tables
   turns out to be insufficient.
3. No support for archived markets in the new summary scope.
4. No redesign of unrelated admin or manager pages.

---

## Solution Overview

### A. Shared market summary contract

Keep one role-agnostic market summary shape derived from existing `markets` and
`market_outcomes` reads.

Market fields:
- `id`
- `polymarket_id`
- `question`
- `category`
- `close_at`
- `status`
- `market_outcomes`

Outcome fields:
- `id`
- `name`
- `odds`
- `effective_odds`
- `updated_at`
- keep `price` in the query because the current user UI already uses it

Status handling:
- include only `open`, `closed`, `resolved` in the summary query
- render labels in uppercase UI form: `OPEN`, `CLOSED`, `RESOLVED`

### B. Shared UI component

Promote the current user market card into a reusable summary component with two
display modes:

1. `interactive`
- used by `user`
- outcomes remain clickable
- existing bet slip behavior remains unchanged

2. `readonly`
- used by `manager` and `super_admin`
- the same summary fields are visible
- no stake or outcome selection interaction is exposed

The component must always render:
- market internal ID
- Polymarket ID
- question
- category when available
- close date when available
- market status
- outcomes list with odds data and update time

Display rules:
- if `effective_odds !== odds`, show both values
- if `effective_odds === odds`, show only the current odds value
- if `category` is null, omit the category field
- if `close_at` is null, omit the close date field

### C. User page changes

Keep the existing user route and page:
- `/markets`

Update the current card rendering in the user feed so the user sees the full
market summary while still being able to place bets from the same page.

This preserves the current flow:
- browse all visible markets
- inspect outcomes
- click outcome
- open bet slip

### D. Manager and super admin pages

Add new dedicated pages:

1. `manager`
- new page listing all visible markets in read-only summary form

2. `super_admin`
- new page listing all visible markets in read-only summary form

Both pages use:
- the same shared query
- the same shared summary component in `readonly` mode

These pages are intentionally separate from the user betting page because
manager/admin roles must not place bets.

### E. Data access strategy

Start from the existing `useMarkets` query and generalize it into a shared hook
that is not user-specific in naming or placement.

Required query changes:
- keep current market fields already selected
- extend nested `market_outcomes` selection with `updated_at`

Target selection shape:

```ts
id,
polymarket_id,
question,
status,
winning_outcome_id,
category,
image_url,
close_at,
last_synced_at,
volume,
market_outcomes!market_outcomes_market_id_fkey(
  id,
  name,
  price,
  odds,
  effective_odds,
  updated_at,
  polymarket_token_id
)
```

If RLS already permits all three roles to read visible markets and outcomes,
keep this frontend-driven approach. Only introduce a view or RPC if that
assumption fails during implementation.

---

## Routing And Navigation

Add role-specific pages and routes:

1. `user`
- keep existing route to markets feed

2. `manager`
- add a new markets route/page in the manager area

3. `super_admin`
- add a new markets route/page in the super admin area

Navigation labels should clearly indicate that these pages are market overviews,
not betting pages.

---

## Testing Strategy

1. Query contract tests
- verify the shared market query selects all required market fields
- verify nested `market_outcomes` includes `updated_at`

2. Shared summary component tests
- verify rendering of market internal ID
- verify rendering of Polymarket ID
- verify rendering of question, category, close date, and status
- verify rendering of outcome name, odds, effective odds, and updated time
- verify `effective_odds` is hidden when equal to `odds`

3. Role-mode behavior tests
- verify `readonly` mode does not expose betting actions
- verify `interactive` mode still supports outcome selection for the user flow

4. Routing/page tests
- verify new manager market page renders the shared market summary list
- verify new super admin market page renders the shared market summary list

---

## Risks And Mitigations

1. **Shared component drift**
- mitigate by using one component with explicit mode switching instead of three
  separate renderers

2. **Query coupling to current user page**
- mitigate by moving the query into a neutral shared feature location before the
  new pages consume it

3. **UI becoming too dense**
- mitigate by conditionally hiding empty fields and only showing effective odds
  when it adds information

4. **Role access mismatch**
- mitigate by validating read permissions early; only add backend indirection if
  the current table access is insufficient

---

## Expected Files To Change

- `src/features/bet/useMarkets.ts` or a replacement shared hook location
- `src/features/bet/index.ts` or equivalent exports
- `src/pages/user/MarketsFeedPage/components/MarketCard/MarketCard.tsx`
- `src/pages/user/MarketsFeedPage/MarketsFeedPage.tsx`
- new manager markets page under `src/pages/manager/`
- new super admin markets page under `src/pages/super-admin/`
- `src/app/router/Router.tsx`
- role navigation/layout files if they need menu entries
- tests covering query, component rendering, and routing
- `src/shared/i18n/locales/en/translation.json`
- `src/shared/i18n/locales/he/translation.json`
