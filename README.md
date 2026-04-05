# POLYBET
Enterprise-grade React application built with **Vite**, **TypeScript**, **Tailwind CSS v4**, **Supabase**, and **react-i18next**.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Start the dev server
npm run dev
```

---

## Scripts

| Command           | Description                    |
| ----------------- | ------------------------------ |
| `npm run dev`     | Start Vite dev server          |
| `npm run build`   | Type-check & build for prod    |
| `npm run preview` | Preview the production build   |
| `npm run lint`    | Run ESLint                     |

---

## Tech Stack

| Layer         | Technology                               |
| ------------- | ---------------------------------------- |
| Framework     | React 19 + TypeScript                    |
| Build Tool    | Vite 7                                   |
| Styling       | Tailwind CSS v4 (`@tailwindcss/vite`)    |
| Backend/BaaS  | Supabase (Auth, DB, Storage)             |
| Localization  | react-i18next + i18next-browser-languagedetector |
| Linting       | ESLint + Prettier                        |

---

## Folder Structure

```text
src/
├── api/                    # API clients & helpers
│   └── supabase/           # Supabase singleton client
├── components/             # Shared, reusable UI components
│   └── Button/             # Example component
├── contexts/               # React context providers
│   └── AuthContext/         # Supabase auth state management
├── hooks/                  # Custom React hooks
│   └── useAuth/            # Auth convenience hook
├── i18n/                   # Internationalization config
│   ├── config.ts           # i18next initialization
│   └── locales/            # Translation JSON files (en, he)
├── pages/                  # Route-level page components
│   └── Home/               # Home page
├── types/                  # Shared TypeScript types
├── utils/                  # Utility functions
├── App.tsx                 # Root component
├── main.tsx                # Entry point
└── index.css               # Tailwind CSS import
```

---

## Folder-per-File Rule

Every component, page, or complex logic block **must** live in its own folder:

```text
/ComponentName
  ├── index.ts              # Re-export for clean imports
  ├── ComponentName.tsx      # Main component (PascalCase)
  ├── const.ts               # Component-specific constants
  └── /components            # Private sub-components (if any)
```

**Import convention** — always import via the folder name:

```ts
import { Button } from '@/components/Button';
```

---

## Path Aliases

The `@/` alias maps to `src/`. Configured in both `tsconfig.app.json` and `vite.config.ts`.

```ts
import { supabase } from '@/api/supabase';
import { useAuth } from '@/hooks/useAuth';
```

---

## Environment Variables

Create a `.env` file from `.env.example`:

| Variable               | Description              |
| ---------------------- | ------------------------ |
| `VITE_SUPABASE_URL`    | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key   |

---

## Localization (i18n)

- Translations live in `src/i18n/locales/{lang}/translation.json`.
- Supported languages: **English (`en`)**, **Hebrew (`he`)**.
- Language is auto-detected from the browser and persisted in `localStorage`.
- Use the `useTranslation` hook from `react-i18next`:

```tsx
const { t } = useTranslation();
return <h1>{t('app.title')}</h1>;
```

---

## Market & Bet Data Update Architecture

This section describes every data flow that keeps markets, odds, bets, and balances in sync — from the Polymarket source to the browser UI.

---

### Backend: sync triggers

```
Polymarket Gamma API
        │
        ├── [pg_cron every 5 min] ── sync-polymarket-markets (resolved_only)
        │                            └─► fetch ~100 recently resolved markets
        │                                └─► settle_market RPC (per market)
        │
        ├── [pg_cron every 5 min] ── sync-polymarket-markets (active_page)
        │                            └─► fetch 1 page of active markets (cursor-based)
        │                                └─► upsert markets + market_outcomes
        │
        ├── [pg_cron every hour :30] ── sync-polymarket-markets (backfill)
        │                               └─► check all markets with open bets
        │                                   └─► settle_market RPC (if resolved)
        │
        └── [Frontend every 30 s] ── refresh-markets edge function
                                     └─► fetch up to 20 visible markets in parallel
                                         └─► upsert market_outcomes (price / odds)
                                             └─► update markets.last_synced_at
```

---

### Database RPCs

**`place_bet(market_id, outcome_id, stake)`** — called by authenticated user

```
Validates: market.status = 'open', balance >= stake, stake <= effective bet limit
Writes:
  bets             INSERT  status='open', locked_odds = current outcome odds
  balances         UPDATE  available -= stake, in_play += stake
  balance_transactions  INSERT  type='bet_lock'
```

**`settle_market(market_id, winning_outcome_id)`** — called by service role only

```
Writes:
  markets               UPDATE  status='resolved', winning_outcome_id, resolved_at
  bets (winners)        UPDATE  status='won'
  bets (losers)         UPDATE  status='lost'
  balances (winners)    UPDATE  available += payout, in_play -= stake
  balances (losers)     UPDATE  in_play -= stake
  balance_transactions  INSERT  type='bet_payout' (per bet)
  market_settlement_log INSERT  audit entry
```

---

### Edge functions

| Function | Caller | Purpose |
|---|---|---|
| `sync-polymarket-markets` | pg_cron / admin UI | Main sync orchestrator — all modes |
| `refresh-markets` | Frontend (30 s interval) | Fast odds refresh for visible markets |
| `settle-markets` | sync-polymarket-markets | Settlement coordinator for a single market |
| `create-user` | Admin / Manager UI | Create manager or user accounts |
| `export-admin-report` | Admin UI | Generate PDF reports |

---

### Frontend hooks

| Hook | Initial load | Realtime subscription | Polling |
|---|---|---|---|
| `useMarkets` | REST query | `market_outcomes.*` → invalidate | `useMarketRefresh` every 30 s |
| `useMyBets` | REST query | `bets UPDATE` filtered by `user_id` → invalidate | — |
| `useUserBalance` | REST query | `balances UPDATE` filtered by `user_id` → invalidate | — |
| `useBetResultNotifications` | Prefetch settled bets | `bets UPDATE` filtered by `user_id` → toast | — |
| `usePlaceBet` | — | — | RPC mutation on user action |
| `useMarketRefresh` | — | — | POST `refresh-markets` every 30 s |

---

### End-to-end latency

| Event | Source | Latency to UI | Mechanism |
|---|---|---|---|
| Odds change (visible markets) | Gamma API | ~1–3 s | 30 s polling → Realtime |
| Odds change (all markets) | Gamma API | 1–5 min | pg_cron active_page |
| Market resolved | Gamma API | ≤ 5 min | pg_cron resolved_only |
| Safety backfill | Gamma API | ≤ 1 hour | pg_cron backfill |
| Bet placed | User action | < 1 s | Realtime |
| Payout after settlement | RPC | < 1 s | Realtime |
| Win / loss notification | RPC | < 1 s | Realtime toast |

---

### Realtime publications

| Table | Events | Subscriber |
|---|---|---|
| `market_outcomes` | `*` | `useMarkets` |
| `bets` | `UPDATE` (user filter) | `useMyBets`, `useBetResultNotifications` |
| `balances` | `UPDATE` (user filter) | `useUserBalance` |
| `balance_transactions` | `INSERT` | audit / reporting |

---

## Authentication

The `AuthProvider` context wraps the entire app and provides:

- `user` — current Supabase user (or `null`)
- `session` — current session
- `loading` — initial auth state loading flag
- `signIn(email, password)` / `signUp(email, password)` / `signOut()`

```tsx
const { user, signIn, signOut } = useAuth();
```
