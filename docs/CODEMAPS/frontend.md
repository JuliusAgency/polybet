<!-- Generated: 2026-06-03 (positions/trades trading model) | Files scanned: ~150 .tsx/.ts | Token estimate: ~900 -->

# Frontend

React 19 + Vite 5 + TypeScript strict + Tailwind v3 + TanStack Query + Zustand + react-router v7. FSD layering. Path alias `@/` → `src/`.

## Entry

```
main.tsx → App.tsx
  └── AppProviders  (AuthProvider · QueryProvider · RTLProvider · ThemeProvider)
       └── Router  (RoleGuard-wrapped routes)
       └── Toaster  (sonner)
```

## Routes (`src/app/router/routes.ts`)

```
SIGN_IN          /sign-in                                   AuthLayout      AuthPages.SignInPage
ADMIN.*          /admin/{dashboard,managers,managers/:id,
                   markets,bets-log,reports,test-lab,
                   limits,settings}                         SuperAdminLayout (super_admin)
MANAGER.*        /manager/{users,users/:id,markets,
                   reports,activity}                        ManagerLayout    (manager|super_admin)
USER.*           /, /markets, /events/:id, /wallet,
                 /my-bets, /saved, /stats                   UserLayout       (any authed)
```

`buildPath(template, params)` for parameterised paths. RoleGuard reads `useAuth().role`.

## Pages

```
src/pages/auth/SignInPage
src/pages/manager/{ManagerUsersPage, ManagerUserProfilePage, ManagerMarketsPage,
                   ManagerReportsPage, ManagerActivityPage}
src/pages/super-admin/{AdminDashboardPage, ManagersPage, ManagerProfilePage,
                       AdminMarketsPage, AdminBetLogPage, AdminReportsPage,
                       TestLabPage, LimitsPage, SettingsPage}
src/pages/user/{MarketsFeedPage, EventDetailPage, MyBetsPage (=Portfolio: positions w/ mark-to-market + Sell),
                SavedMarketsPage, StatsPage, WalletPage}
```
Widgets: `widgets/SellSlip` (Portfolio sell modal → SellForm), `widgets/BetSlip` (Buy/Sell tabs; Sell tab renders SellForm for the held position).

## State management

| Concern | Tool | Where |
|---|---|---|
| Server state | TanStack Query | hooks under `src/features/<domain>/` |
| Auth session | React context | `AuthProvider` → `useAuth()` |
| Theme | React context + localStorage | `ThemeProvider` → `useTheme()` (key: `polybet-theme`) |
| RTL direction | React effect | `RTLProvider` (sets `<html dir>`) |
| URL state | router params + search params | `react-router-dom` `useParams`/`useSearchParams` |
| Local UI state | `useState` | components |
| Zustand store | bet slip / lightweight UI flows | declared per-feature when needed |

## Feature hooks (`src/features/`)

```
auth/sign-in, auth/sign-out
bet/                                            (markets, events, bets, balance, prices)
  useMarkets               infinite list, cursor by sort_volume; calls useMarketRefresh
  useMarketsByIds          single fetch by ids list (saved, my-bets cross-fetch)
  useEventById             single event with markets+outcomes; refetchInterval=30s
  useEventPriceHistory     bucketed prices for chart
  useMarketRefresh         POSTs refresh-markets edge fn; patches ['markets']
                           Accepts (ids, true|false) OR (ids, { autoRefresh?, eventId? }).
                           When `eventId` is passed, invalidates ['event', eventId] after refresh.
                           eventId tracked via ref (not closure) to stay fresh across navigations.
  TRADING MODEL (positions + trades, 2026-06-02):
  usePositions             open positions (portfolio); poll 30s
  usePositionHistory       closed/won/lost positions
  useTrades                immutable fill ledger (buy + sell)
  useMyBets                ADAPTER over positions → legacy MyBet shape (feed/event "you hold this")
  usePlaceBet              mutation → place_bet RPC (BUY)
  useBetQuote              live ASK quote via quote-bet edge fn (BetSlip Buy)
  useSellQuote             live BID quote via quote-sell edge fn (Sell)
  useSellPosition          mutation → sell_position RPC (+PriceDriftError, P0002)
  SellForm                 (features/bet/SellForm) reusable sell form — used by widgets/SellSlip + BetSlip Sell tab
  useUserBalance           balances row + realtime listener (filter by user_id)
  useUserTransactions      ledger view + realtime on balance_transactions
  useBetResultNotifications  toast won/lost via balance_transactions INSERT (bet_payout) → also invalidates positions
  useSimilarEvents, useMarketCategories, useAllowedCategoryTags
  groupMarketsByEvent, priceHistoryBucket, usePriceHistory
favorites/                                       (toggle saved markets)
wallet/useUserTransactions
admin/{adjust-balance, agent-stats, bet-limits, bet-log, financial-transactions,
       managers, manager-users, manage-user, markets, reports, settings, settlement}
manager/{user list/profile/markets/reports}
super-admin/(stats KPI tiles)
stats/useSystemKpis        polls every 30s (cross-user data — no realtime; see CLAUDE.md)
```

## Realtime listeners (per-user only)

```
balances             useUserBalance              filter user_id=eq.${userId}
balance_transactions useBetResultNotifications   filter user_id=eq.${userId} (bet_payout INSERT → toast + invalidate positions)
balance_transactions useUserTransactions         filter user_id=eq.${userId}
profiles             AuthProvider                filter id=eq.${userId} (manager-block check)
```

`positions`/`trades` are NOT in the realtime publication — usePositions/usePositionHistory poll + are invalidated by buy/sell mutations and the bet_payout signal above. `useMyBets` is now an adapter over those queries (no own realtime).

Cross-user data uses `refetchInterval: 30_000` polling (`useSystemKpis`, `useAgentStats`, `useFinancialTransactions`).

## Layouts

```
AuthLayout         (no nav, centered card, language switcher)
UserLayout         header + main + footer; user balance pill, ThemeSwitcher, LanguageSwitcher
ManagerLayout      sidebar + main; isRTL-aware via inline flex-direction
SuperAdminLayout   sidebar + main; same RTL pattern
```

## Shared

```
src/shared/api/supabase     (singleton client + invokeSupabaseFunction)
src/shared/config/markets.ts (MARKETS_PAGE_LIMIT, MARKETS_REFRESH_INTERVAL_MS=30s, MARKETS_REFRESH_MAX_IDS=20)
src/shared/i18n             (i18next + en/he/translation.json)
src/shared/theme            (CSS vars in tokens.css; colorsByTheme for JS-only)
src/shared/ui               (Button, Card, Modal, OddsBar, ChanceGauge, ProbabilityGauge,
                             PriceHistoryChart, Skeleton family, Spinner, Input,
                             ThemeSwitcher, LanguageSwitcher, MarketThumbnail, …)
src/shared/hooks            (useAuth, useTheme, …)
src/shared/utils            (formatters, dates, currency)
src/shared/types            (SystemKpi, etc.)
```

## Conventions

- Folder-per-component: `Foo/{Foo.tsx, index.ts, const.ts?, components/?}`. Import `@/shared/ui/Foo`.
- Theme tokens only — no hardcoded colours.
- All user-visible strings via `t('key')` with both en + he keys.
- RTL: inline `flexDirection` for sidebars (Tailwind `rtl:` variants are unreliable); always `text-start` on `<th>` directly (UA `text-align:center` overrides inherited).
- Use `ROUTES` map + `buildPath` — never hand-concat URLs.
