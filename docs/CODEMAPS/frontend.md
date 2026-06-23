<!-- Generated: 2026-06-23 | ~140 .tsx/.ts (app/pages/widgets/features/entities/shared) | ~980 tokens -->

# Frontend

React 19 + Vite 5 + TS strict + Tailwind v3 + TanStack Query v5 + Zustand + react-router v7. FSD layering (`app→pages→widgets→features→entities→shared`). Path alias `@/` → `src/`.

## Entry

```
main.tsx → App.tsx
  └── AppProviders   (ThemeProvider › QueryProvider › AuthProvider › RTLProvider)  [outer→inner]
       └── Router    (BrowserRouter + ErrorBoundary + Suspense; RoleGuard groups)
       └── Toaster   (sonner)
```
AuthProvider lazy-loads supabase via module-level singleton promise; 3 effects: bootstrap, onAuthStateChange, per-user `profiles` realtime guard (force sign-out on is_active=false).

## Routes (`src/app/router/routes.ts`, `buildPath(tpl, params)`)

```
SIGN_IN     /sign-in                                          AuthLayout
ADMIN.*     /admin/{dashboard,managers,managers/:id,markets,  SuperAdminLayout (super_admin)
              markets/:id,bets-log,reports,test-lab,limits,settings}
MANAGER.*   /manager/{users,users/:id,markets,markets/:id,    ManagerLayout (manager|super_admin)
              reports,activity}
USER.*      / /markets /events/:id /wallet /my-bets /saved /stats   UserLayout (pathless, any authed)
```
RoleGuard: loading spinner while auth/role resolves → Navigate /sign-in if no user → cross-role redirect via `getDashboardForRole(role)`. EventDetailPage is ONE component mounted at `/events/:id`, `/admin/markets/:id`, `/manager/markets/:id` (readonly prop). `MANAGER.TREASURY` has no route — `pages/manager/TreasuryPage` is DEAD.

## Pages (`src/pages/`)

```
auth/SignInPage
user/  MarketsFeedPage (636L: tag/subtag/status filters, WC hero+subtabs, infinite scroll,
                        docked/overlay BetSlip, My-Bets+Saved view toggle)
       EventDetailPage (388L, 3-role readonly; ?market= deep-link + desktop auto-select)
       MyBetsPage (Portfolio: usePositions+usePositionHistory, mark-to-market + SellSlip; NOT bets)
       SavedMarketsPage (standalone; dup of feed dock logic + BalanceWidget)
       WalletPage, StatsPage
super-admin/ AgentsDashboardPage (659L: mgr stats + KPI + 6-dim sync-health panel)
       ManagerProfilePage (958L: mgr + users; inline Adjust/ResetPassword modals, raw supabase)
       GlobalBetLogPage (admin_bet_log view, Side col buy/sell, Polymarket ExternalLink)
       MarketsPage, ManagersPage, ReportsPage, TestLabPage, LimitsPage, SettingsPage
manager/ MarketsPage (≈twin of admin MarketsPage, ROUTES.MANAGER href), UsersPage, ReportsPage,
       UserActivityPage (dual-context: /manager/activity vs /manager/users/:id via routeUserId)
```

## State management

| Concern | Tool / Where |
|---|---|
| Server state | TanStack Query — hooks in `features/<domain>/` |
| Auth session | `AuthProvider` → `useAuth()` |
| Theme | `ThemeProvider` → `useTheme()` (localStorage `polybet-theme`) |
| RTL dir | `RTLProvider` sets `<html dir>` |
| URL state | `useParams`/`useSearchParams` (filters, tab, ?market=) |
| Local UI | `useState`; Zustand per-feature when needed |

## Feature hooks (`src/features/`, ~65 hooks; TanStack Query)

```
bet/  TRADING (positions+trades; bets FROZEN):
  useMarkets         infinite keyset (sort_volume|trending_rank); calls useMarketRefresh; .contains('tag_slugs')
  useEventById       event+markets refetchInterval=3s (MARKETS_PRICE_POLL_INTERVAL_MS); 2 seq reads
  useMarketRefresh   TWO intervals: 30s edge refresh-markets + 3s DB patchVisibleFromDb; invalidates ['event',id] when eventId set
  usePositions / usePositionHistory / useTrades   poll; key incl userId
  useMyBets          ADAPTER positions→legacy MyBet (feed/event "you hold")
  usePlaceBet (place_bet, OddsDriftError P0002) / useSellPosition (sell_position, PriceDriftError P0002)
  useBetQuote (quote-bet 2s) / useSellQuote (quote-sell 2s)
  SellForm/          reusable sell UI — used by widgets/SellSlip + BetSlip Sell tab (NOT a widget, FSD)
  useUserBalance     balances + realtime (user_id filter); key ['user','balance',userId]
  useBetResultNotifications  realtime balance_transactions INSERT(bet_payout) → toast + invalidate positions
  WORLD CUP: useWorldCupWinner, useWorldCupGames, useWorldCupProps (paginates by EVENT), useWorldCupWinnerEventId
  useCategorySubtags (system_settings.category_subtags), useAllowedCategoryTags
  useEventFavoriteState, useEventMarketCounts (event_market_counts RPC), useArchiveMarket
favorites/  useToggleFavoriteMarket, useToggleFavoriteEvent (cascade-deletes child mkt favs); optimistic
wallet/  useUserTransactions  realtime balance_transactions (user_id) — 2nd subscriber on same table
admin/   bet-limits (useAllLimitsData/useBetLimitSettings: multi-step seq reads), managers, manager-users,
         manage-user (useAdminUpdateUser/ToggleBlock/ResetPassword/AdjustBalance — no cache invalidation),
         financial-transactions, reports (useManagersReport→admin_get_report_dataset), settlement
manager/ balance/AdjustBalanceModal, user list/profile
stats/   useSystemKpis (poll 30s), useSyncHealth (get_sync_health RPC poll 60s; ws/tokens/heartbeat/pending), useUserStats
auth/    sign-in (useSignIn: awaitingRole effect — no timeout dead-end), sign-out
```
KEY MISMATCH: usePlaceBet/useSellPosition invalidate 2-elem `['user','balance'|'positions'|'trades']` (prefix-matches the 3-elem registered keys, works but inconsistent vs useBetResultNotifications which uses userId).

## Realtime listeners (per-user filter ONLY)

```
balances              useUserBalance              user_id=eq.${id}
balance_transactions  useBetResultNotifications   user_id=eq.${id}  (bet_payout INSERT → toast + invalidate)
balance_transactions  useUserTransactions         user_id=eq.${id}  (2nd channel, same table)
profiles              AuthProvider                id=eq.${id}       (is_active guard)
```
`positions`/`trades`/`markets`/`market_outcomes`/`events` NOT in publication → polled + invalidated by mutations. Cross-user data uses `refetchInterval` (KPIs 30s, sync-health 60s).

## Layouts (`src/app/layouts/`)

```
AuthLayout       centered card, LanguageSwitcher
UserLayout       top nav: NavMarketSearch + balance/in-play pill + ActiveBetsDrawer; mounts
                 useUserBalance+useMyBets+useBetResultNotifications globally; Theme/Lang switchers
ManagerLayout    sidebar (Markets/Users/Reports/Activity); inline flexDirection for RTL
SuperAdminLayout sidebar (8 routes incl TestLab); same RTL pattern
```

## Widgets (`src/widgets/`, 17)

```
Cards    EventCard(369L) MarketCard(336L)            — share card shell (dup)
Trade    BetSlip(607L Buy/Sell tabs, docked|overlay via BETSLIP_DOCK_QUERY) SellSlip(modal→SellForm)
Tables   FinancialTransactionsTable ManagersReportTable ActiveBetsDrawer(global) BalanceWidget(Saved-only)
Search   NavMarketSearch(navbar combobox) CollapsibleSearch FeedSearchTools(MyBets/Saved/Filter toggles)
Filters  TagFilter SubTagFilter StatusFilter
WorldCup WorldCupHero(flag-wheel rAF) WorldCupMap(cobe globe) GamesList+GameCard
```
FSD violations: GameCard/WorldCupMap/NavMarketSearch import `@/app/router/routes`. Filter-bar trio duplicated across feed + admin + manager MarketsPage.

## Shared (`src/shared/`)

```
api/supabase  client (sessionStorage auth, throws on missing env) · invokeSupabaseFunction → invokeAuthedFunction
              (60s skew refresh + single 401-retry) · selects/{MARKET_SELECT_FULL,_NO_EVENT,EVENT_SELECT}
config        markets.ts (REFRESH=30s, PRICE_POLL=3s, PAGE_LIMIT=50), validation, worldCup, countries
i18n          i18next + locales/{en,he}/translation.json
theme         tokens.css (OKLCH dark :root / light [data-theme=light]); const THEME_STORAGE_KEY
ui            Button Card Badge Input Modal SidePanel(docked) Spinner Skeleton TableSkeleton CardGridSkeleton
              OutcomeButtons ChanceGauge BetMarker MarketThumbnail PriceHistoryChart(+WindowToggle)
              BookmarkButton EventBookmarkButton UnseenBadge ProgressBar ExternalLink ErrorBoundary
              LanguageSwitcher ThemeSwitcher EditUserModal SetPasswordModal
hooks         useMediaQuery (useSyncExternalStore), useHorizontalScroll (RTL-aware), useDebounce
utils         formatVolume/Probability/SharePrice, mapBalanceErrorMessage, polymarketMarketUrl(eventSlug,mktSlug),
              dedupeSavedMarkets, marketMatchesSearch
entities      bet(MyBet adapter) event(MarketEvent+GameTeam,effectiveStatus) market(types,statusFilter,outcomes)
              position(Position/Trade,pnl). balance/manager/outcome/transaction/user = .gitkeep only
```

## Known drift / gotchas

- `colorsByTheme`, `OddsBar`, `ProbabilityGauge` referenced in CLAUDE.md but DON'T exist — use ChanceGauge + hardcoded OKLCH in `priceHistoryPalette.ts`.
- `BookmarkButton`/`EventBookmarkButton`/`PriceHistoryChart` import from `@/features` (FSD violation, shared←features).
- `Button/const.ts` uses raw Tailwind `bg-blue-600` etc — bypasses OKLCH tokens.
- `database.ts` TransactionType missing `bet_sell`; DbBalanceTransaction missing trade_id/position_id; DbBet dead.
- `EVENT_SELECT` + MarketEvent lack `slug` → polymarketMarketUrl 404 bug (2026-06-10).
- Modal/SidePanel/Spinner aria-labels hardcoded English (not i18n).

## Conventions

- Folder-per-component `Foo/{Foo.tsx,index.ts,const.ts?,components/?}`; import `@/shared/ui/Foo`.
- Theme tokens only, no hardcoded colours. All strings via `t()` with en+he keys.
- RTL: inline `flexDirection` for sidebars; `text-start` directly on `<th>`; `ms-`/`me-` spacing.
- Use `ROUTES` + `buildPath` — never hand-concat URLs. No direct supabase calls in components — go via feature hooks.
