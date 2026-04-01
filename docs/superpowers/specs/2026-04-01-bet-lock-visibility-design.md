# Bet Lock Visibility — Design Spec

**Date:** 2026-04-01
**Status:** Approved

## Problem

The bet lock mechanism (funds moved from `available` to `in_play` on `place_bet`) is implemented correctly in the DB but invisible to the user on the MarketsFeed page. The user sees no indication that funds are frozen or can track their active bets.

---

## Solution Overview

Two changes:

1. **Balance Widget on MarketsFeedPage** — compact bar showing Available / In-Play with clickable drawer of active bets.
2. **Balance Preview in BetSlip** — projected balance state shown before confirming a bet.

---

## Part 1: Balance Widget + Active Bets Drawer

### BalanceWidget component

**Location:** `src/pages/user/MarketsFeedPage/components/BalanceWidget/`

**Behavior:**
- Renders a compact horizontal bar under the page title, above the filter bar.
- Displays two values: `Available: X.XX` and `In Play: Y.YY [▼ N bets]`.
- `In Play` label uses `--color-accent` when `in_play > 0`, otherwise `--color-text-secondary`.
- The "In Play" section (including bet count badge) is a clickable button that opens `ActiveBetsDrawer`.
- Data comes from `useUserBalance()` which already has realtime subscription — no new data fetching needed.
- Bet count comes from `useMyBets()`, counting `status === 'open'` bets. If 0 open bets, hide the "N bets" badge.
- If balance is loading, show skeleton placeholders.

### ActiveBetsDrawer component

**Location:** `src/pages/user/MarketsFeedPage/components/ActiveBetsDrawer/`

**Behavior:**
- Slides in from the right (or bottom on narrow screens) as an overlay panel.
- Controlled by `isOpen` / `onClose` props passed from `MarketsFeedPage`.
- Fetches bets via `useMyBets()` — already used in the page tree, no new RPC.
- Filters to `status === 'open'` bets only.
- Each row shows: market question (truncated), selected outcome name, stake, locked odds, potential payout.
- Shows a summary footer: total locked amount = sum of all open stakes.
- Empty state: "No active bets" message.
- Closes on backdrop click or Escape key.

**Implementation notes:**
- Drawer is a new shared-style panel, not a Modal. Uses `position: fixed`, `inset-inline-end: 0`, overlay backdrop.
- RTL: uses `inset-inline-end` so drawer appears on correct side in Hebrew.
- No new API calls — `useMyBets` is already called in `MyBetsPage`; `MarketsFeedPage` will call it too (React Query deduplicates).

### MarketsFeedPage changes

- Import and render `BalanceWidget` between `<h1>` and the filter bar.
- Pass `onOpenDrawer` callback to `BalanceWidget`.
- Manage `isDrawerOpen` state.
- Render `ActiveBetsDrawer` controlled by that state.
- Pass `inPlay` value from `useUserBalance` down to `BetSlip` as a new prop.

---

## Part 2: Balance Preview in BetSlip

### BetSlip changes

**New prop:** `inPlay: number`

**New UI block** (rendered only when `isValidStake && !isInsufficient`):

```
After bet:
  Available:  850.00 → 750.00
  In Play:    150.00 → 250.00
```

- Placed between the stake input block and the potential payout block.
- Arrow `→` separates current value from projected value.
- Projected available = `availableBalance - stake`.
- Projected in-play = `inPlay + stake`.
- Projected values use `--color-text-primary`; current values use `--color-text-muted`.
- i18n keys: `betSlip.afterBet`, `betSlip.available`, `betSlip.inPlay`.

---

## i18n keys to add

**en/translation.json:**
```json
"betSlip": {
  "afterBet": "After bet",
  "available": "Available",
  "inPlay": "In play"
},
"markets": {
  "activeBets": "{{count}} bet",
  "activeBets_other": "{{count}} bets",
  "totalLocked": "Total locked"
},
"myBets": {
  "noActiveBets": "No active bets"
}
```

**he/translation.json:** corresponding Hebrew translations.

---

## Files changed

| File | Change |
|------|--------|
| `MarketsFeedPage/MarketsFeedPage.tsx` | Add `BalanceWidget`, `ActiveBetsDrawer`, `isDrawerOpen` state, pass `inPlay` to `BetSlip` |
| `MarketsFeedPage/components/BetSlip/BetSlip.tsx` | Add `inPlay` prop, render balance preview block |
| `MarketsFeedPage/components/BalanceWidget/` | New component (folder + index.ts) |
| `MarketsFeedPage/components/ActiveBetsDrawer/` | New component (folder + index.ts) |
| `src/shared/i18n/locales/en/translation.json` | New keys |
| `src/shared/i18n/locales/he/translation.json` | New keys |

---

## Out of scope

- No changes to DB, RPCs, or edge functions.
- No changes to WalletPage (already shows in_play correctly).
- No "cancel bet" functionality.
- No push notifications for bet settlement.
