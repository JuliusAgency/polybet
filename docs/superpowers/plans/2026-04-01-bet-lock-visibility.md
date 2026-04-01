# Bet Lock Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bet lock mechanism visible to users via a balance widget with active bets drawer on MarketsFeedPage, and a balance preview inside BetSlip.

**Architecture:** Add `BalanceWidget` and `ActiveBetsDrawer` components co-located in `MarketsFeedPage/components/`. Extend `BetSlip` with an `inPlay` prop. No new API calls — `useMyBets` and `useUserBalance` already exist with realtime subscriptions; React Query deduplicates concurrent callers.

**Tech Stack:** React 19, TypeScript (strict), react-i18next, @tanstack/react-query, Tailwind CSS v4, CSS variables for theming.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/pages/user/MarketsFeedPage/components/BalanceWidget/BalanceWidget.tsx` | Create | Compact bar: Available + In-Play + bet count button |
| `src/pages/user/MarketsFeedPage/components/BalanceWidget/index.ts` | Create | Re-export |
| `src/pages/user/MarketsFeedPage/components/ActiveBetsDrawer/ActiveBetsDrawer.tsx` | Create | Slide-in panel listing open bets |
| `src/pages/user/MarketsFeedPage/components/ActiveBetsDrawer/index.ts` | Create | Re-export |
| `src/pages/user/MarketsFeedPage/MarketsFeedPage.tsx` | Modify | Wire up BalanceWidget, ActiveBetsDrawer, pass `inPlay` to BetSlip |
| `src/pages/user/MarketsFeedPage/components/BetSlip/BetSlip.tsx` | Modify | Add `inPlay` prop + balance preview block |
| `src/shared/i18n/locales/en/translation.json` | Modify | Add new i18n keys |
| `src/shared/i18n/locales/he/translation.json` | Modify | Add new i18n keys (Hebrew) |

---

## Task 1: Add i18n keys (EN + HE)

**Files:**
- Modify: `src/shared/i18n/locales/en/translation.json`
- Modify: `src/shared/i18n/locales/he/translation.json`

- [ ] **Step 1: Add keys to en/translation.json**

In `markets` object add:
```json
"activeBets_one": "{{count}} bet",
"activeBets_other": "{{count}} bets",
"noActiveBets": "No active bets",
"totalLocked": "Total locked"
```

In `markets` object also add under `betSlip` — but since there is no `betSlip` key at top level, add to `markets`:
```json
"afterBet": "After bet",
"afterBetAvailable": "Available",
"afterBetInPlay": "In play"
```

The final diff in `en/translation.json` inside `"markets": { ... }`:
```json
"activeBets_one": "{{count}} bet",
"activeBets_other": "{{count}} bets",
"noActiveBets": "No active bets",
"totalLocked": "Total locked",
"afterBet": "After bet",
"afterBetAvailable": "Available",
"afterBetInPlay": "In play"
```

- [ ] **Step 2: Add keys to he/translation.json**

Inside `"markets": { ... }`:
```json
"activeBets_one": "הימור {{count}}",
"activeBets_other": "{{count}} הימורים",
"noActiveBets": "אין הימורים פעילים",
"totalLocked": "סך חסום",
"afterBet": "לאחר הימור",
"afterBetAvailable": "זמין",
"afterBetInPlay": "בהשמה"
```

- [ ] **Step 3: Commit**

```bash
cd polybet
git add src/shared/i18n/locales/en/translation.json src/shared/i18n/locales/he/translation.json
git commit -m "feat: add i18n keys for bet lock visibility"
```

---

## Task 2: Create BalanceWidget component

**Files:**
- Create: `src/pages/user/MarketsFeedPage/components/BalanceWidget/BalanceWidget.tsx`
- Create: `src/pages/user/MarketsFeedPage/components/BalanceWidget/index.ts`

- [ ] **Step 1: Create BalanceWidget.tsx**

```tsx
import { useTranslation } from 'react-i18next';

interface BalanceWidgetProps {
  available: number;
  inPlay: number;
  openBetsCount: number;
  isLoading: boolean;
  onOpenDrawer: () => void;
}

export const BalanceWidget = ({
  available,
  inPlay,
  openBetsCount,
  isLoading,
  onOpenDrawer,
}: BalanceWidgetProps) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div
        className="mb-4 flex items-center gap-4 rounded-lg px-4 py-2.5"
        style={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
      >
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {t('common.loading')}
        </span>
      </div>
    );
  }

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg px-4 py-2.5"
      style={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* Available balance */}
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {t('wallet.available')}
        </span>
        <span className="font-mono text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {available.toFixed(2)}
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--color-border)' }} />

      {/* In-play balance — clickable */}
      <button
        onClick={onOpenDrawer}
        className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-bg-elevated)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
        }}
      >
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {t('wallet.inPlay')}
        </span>
        <span
          className="font-mono text-sm font-semibold"
          style={{ color: inPlay > 0 ? 'var(--color-accent)' : 'var(--color-text-primary)' }}
        >
          {inPlay.toFixed(2)}
        </span>
        {openBetsCount > 0 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-bg-base)',
            }}
          >
            {t('markets.activeBets_other', { count: openBetsCount })}
          </span>
        )}
        {/* chevron-down icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Create index.ts**

```ts
export { BalanceWidget } from './BalanceWidget';
```

- [ ] **Step 3: Commit**

```bash
cd polybet
git add src/pages/user/MarketsFeedPage/components/BalanceWidget/
git commit -m "feat: add BalanceWidget component"
```

---

## Task 3: Create ActiveBetsDrawer component

**Files:**
- Create: `src/pages/user/MarketsFeedPage/components/ActiveBetsDrawer/ActiveBetsDrawer.tsx`
- Create: `src/pages/user/MarketsFeedPage/components/ActiveBetsDrawer/index.ts`

- [ ] **Step 1: Create ActiveBetsDrawer.tsx**

```tsx
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyBets } from '@/features/bet';

interface ActiveBetsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ActiveBetsDrawer = ({ isOpen, onClose }: ActiveBetsDrawerProps) => {
  const { t, i18n } = useTranslation();
  const { data: bets, isLoading } = useMyBets();

  const openBets = (bets ?? []).filter((b) => b.status === 'open');
  const totalLocked = openBets.reduce((sum, b) => sum + b.stake, 0);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 40, backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className="fixed top-0 bottom-0 flex flex-col"
        style={{
          insetInlineEnd: 0,
          zIndex: 41,
          width: '100%',
          maxWidth: '420px',
          backgroundColor: 'var(--color-bg-elevated)',
          borderInlineStart: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-lg)',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('wallet.inPlay')}
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-lg"
            style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('common.loading')}
            </p>
          )}

          {!isLoading && openBets.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('markets.noActiveBets')}
            </p>
          )}

          {!isLoading && openBets.length > 0 && (
            <div className="flex flex-col gap-3">
              {openBets.map((bet) => (
                <div
                  key={bet.id}
                  className="rounded-lg p-3"
                  style={{
                    backgroundColor: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {/* Market question */}
                  <p
                    className="mb-2 text-sm font-medium"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {bet.markets?.question ?? '—'}
                  </p>

                  {/* Outcome */}
                  <p className="mb-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {bet.market_outcomes?.name ?? '—'}
                  </p>

                  {/* Stake / Odds / Payout row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {t('myBets.wager')}
                      </span>
                      <span className="font-mono text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {bet.stake.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        @
                      </span>
                      <span className="font-mono text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                        {bet.locked_odds.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {t('myBets.potentialPayout')}
                      </span>
                      <span className="font-mono text-xs font-semibold" style={{ color: 'var(--color-win)' }}>
                        {bet.potential_payout.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Placed at */}
                  <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(bet.placed_at).toLocaleString(i18n.language, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: total locked */}
        {!isLoading && openBets.length > 0 && (
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderTop: '1px solid var(--color-border)' }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t('markets.totalLocked')}
            </span>
            <span className="font-mono text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
              {totalLocked.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </>
  );
};
```

- [ ] **Step 2: Create index.ts**

```ts
export { ActiveBetsDrawer } from './ActiveBetsDrawer';
```

- [ ] **Step 3: Commit**

```bash
cd polybet
git add src/pages/user/MarketsFeedPage/components/ActiveBetsDrawer/
git commit -m "feat: add ActiveBetsDrawer component"
```

---

## Task 4: Extend BetSlip with inPlay prop and balance preview

**Files:**
- Modify: `src/pages/user/MarketsFeedPage/components/BetSlip/BetSlip.tsx`

Current `BetSlipProps`:
```ts
interface BetSlipProps {
  market: Market;
  outcome: MarketOutcome;
  availableBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}
```

- [ ] **Step 1: Add `inPlay` prop to the interface**

Change the interface to:
```ts
interface BetSlipProps {
  market: Market;
  outcome: MarketOutcome;
  availableBalance: number;
  inPlay: number;
  onClose: () => void;
  onSuccess: () => void;
}
```

Add `inPlay` to the destructured params:
```ts
export const BetSlip = ({
  market,
  outcome,
  availableBalance,
  inPlay,
  onClose,
  onSuccess,
}: BetSlipProps) => {
```

- [ ] **Step 2: Add preview variables after existing `potentialPayout` calculation**

After line:
```ts
const potentialPayout = isValidStake && !isInsufficient ? stake * outcome.effective_odds : null;
```

Add:
```ts
const projectedAvailable = isValidStake && !isInsufficient ? availableBalance - stake : null;
const projectedInPlay = isValidStake && !isInsufficient ? inPlay + stake : null;
```

- [ ] **Step 3: Add balance preview block in JSX**

Insert between the stake input block and the `{potentialPayout !== null && ...}` block:

```tsx
{/* Balance preview after bet */}
{projectedAvailable !== null && projectedInPlay !== null && (
  <div
    className="rounded-lg p-3"
    style={{ backgroundColor: 'var(--color-bg-base)' }}
  >
    <p className="mb-2 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
      {t('markets.afterBet')}
    </p>
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span style={{ color: 'var(--color-text-secondary)' }}>{t('markets.afterBetAvailable')}</span>
        <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {availableBalance.toFixed(2)}
          {' → '}
          <span style={{ color: 'var(--color-text-primary)' }}>{projectedAvailable.toFixed(2)}</span>
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span style={{ color: 'var(--color-text-secondary)' }}>{t('markets.afterBetInPlay')}</span>
        <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {inPlay.toFixed(2)}
          {' → '}
          <span style={{ color: 'var(--color-accent)' }}>{projectedInPlay.toFixed(2)}</span>
        </span>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
cd polybet
git add src/pages/user/MarketsFeedPage/components/BetSlip/BetSlip.tsx
git commit -m "feat: add balance preview to BetSlip"
```

---

## Task 5: Wire everything up in MarketsFeedPage

**Files:**
- Modify: `src/pages/user/MarketsFeedPage/MarketsFeedPage.tsx`

- [ ] **Step 1: Add imports**

Add to the existing imports:
```tsx
import { BalanceWidget } from './components/BalanceWidget';
import { ActiveBetsDrawer } from './components/ActiveBetsDrawer';
import { useMyBets } from '@/features/bet';
```

- [ ] **Step 2: Add state and derived values**

After the existing `const { data: balance } = useUserBalance();` line, add:
```tsx
const { data: bets } = useMyBets();
const [isDrawerOpen, setIsDrawerOpen] = useState(false);

const inPlay = balance?.in_play ?? 0;
const openBetsCount = (bets ?? []).filter((b) => b.status === 'open').length;
```

Also update the existing `const availableBalance = balance?.available ?? 0;` line — it stays as-is.

- [ ] **Step 3: Add BalanceWidget after `<h1>`**

Replace:
```tsx
      {/* Success banner */}
```

With:
```tsx
      {/* Balance widget */}
      <BalanceWidget
        available={availableBalance}
        inPlay={inPlay}
        openBetsCount={openBetsCount}
        isLoading={!balance}
        onOpenDrawer={() => setIsDrawerOpen(true)}
      />

      {/* Success banner */}
```

- [ ] **Step 4: Pass `inPlay` to BetSlip**

Find the existing `<BetSlip` JSX and add the `inPlay` prop:
```tsx
        <BetSlip
          market={selectedBet.market}
          outcome={selectedBet.outcome}
          availableBalance={availableBalance}
          inPlay={inPlay}
          onClose={() => setSelectedBet(null)}
          onSuccess={handleBetSuccess}
        />
```

- [ ] **Step 5: Add ActiveBetsDrawer at the end of the returned JSX, before the closing `</div>`**

```tsx
      {/* Active bets drawer */}
      <ActiveBetsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
```

- [ ] **Step 6: Commit**

```bash
cd polybet
git add src/pages/user/MarketsFeedPage/MarketsFeedPage.tsx
git commit -m "feat: wire up BalanceWidget and ActiveBetsDrawer in MarketsFeedPage"
```

---

## Task 6: Build verification

- [ ] **Step 1: Run TypeScript build**

```bash
cd polybet
npm run build
```

Expected: exit 0, no type errors.

If there are errors, fix them before proceeding.

- [ ] **Step 2: Run lint**

```bash
cd polybet
npm run lint
```

Expected: no errors or warnings introduced by this change.

- [ ] **Step 3: Smoke test checklist (manual)**

Open the app and verify:
1. MarketsFeedPage shows the balance widget bar under the title
2. "In Play" section shows `0.00` initially and clicking it opens the drawer with "No active bets"
3. Place a bet — widget updates immediately (realtime): Available decreases, In Play increases, bet count badge appears
4. Clicking the In-Play section opens the drawer showing the new bet with correct stake / odds / payout
5. BetSlip shows the "After bet" preview as soon as a valid stake is entered
6. Both EN and HE locales show correct text
7. In Hebrew: drawer slides in from the correct side (insetInlineEnd: 0 = left in RTL)
