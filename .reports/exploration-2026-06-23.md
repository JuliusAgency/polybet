<!-- Generated: 2026-06-23 | scanned: 6 subsystems, ~146 migrations, 8 edge fns, ~65 FE hooks, 17 widgets, 26 ui primitives, market-tracker (Heroku) | ~8500 tokens -->

# PolyBet Deep Exploration Report — 2026-06-23

Source of truth: read-only explorer pass over FE (`src/`), Supabase (`supabase/`), and `services/market-tracker/`.
This is the DEEP report feeding refactor + test phases (NOT token-lean). Section index:
1. System map (FE + backend, execution paths)
2. Prioritized HOTSPOTS by category
3. market-tracker deep dive
4. Top 10 behavior-preserving refactor candidates
5. Top 10 test-coverage gaps

---

## 1. System Map

### FSD layers (imports flow `app → pages → widgets → features → entities → shared`)

```
app/        providers (ThemeProvider>QueryProvider>AuthProvider>RTLProvider), Router, RoleGuard, 4 layouts
pages/      14 page components (auth/user/super-admin/manager); EventDetailPage shared across 3 roles
widgets/    17 composite blocks (BetSlip, EventCard, MarketCard, SellSlip, tables, feed filters, World Cup)
features/   ~65 hooks across auth, bet, favorites, wallet, admin, manager, super-admin, stats
entities/   bet, event, market, position populated; balance/manager/outcome/transaction/user = .gitkeep only
shared/     supabase client + invokeAuthedFunction, select fragments, 26 ui primitives, utils, i18n, theme, config
```

### Routing tree (`src/app/router/`)
- Single `BrowserRouter` → `ErrorBoundary` → `Suspense`.
- 3 role groups via `RoleGuard`: `/admin` (super_admin), `/manager` (manager), pathless `/` (user).
- `ROUTES` (routes.ts, 39 lines) = single URL source; `buildPath(tpl, params)` for dynamic segments.
- `RoleGuard`: loading spinner → unauth `Navigate(sign-in)` → wrong-role `getDashboardForRole(role)`.
- `getDashboardForRole`: user→`/markets`, manager→`/manager/users`, super_admin→`/admin/dashboard`.

### Auth state machine (`AuthProvider.tsx`, 183 lines)
- Lazy module-level singleton promise loads supabase client.
- 3 effects: (a) bootstrap session, (b) `onAuthStateChange` subscription → `loadProfile()` → `setRole()`,
  (c) per-user Realtime channel on `profiles` (filter `id=eq.userId`) → force sign-out on `is_active=false`.

### Core execution paths
```
SIGN-IN: SignInForm → signIn() → supabase.auth.signInWithPassword → onAuthStateChange
         → loadProfile() → setRole() → RoleGuard unblock → Navigate(role dashboard)

FEED:    /markets → UserLayout Outlet → MarketsFeedPage → useMarkets(status,search,null,tag,subTag)
         → useInfiniteQuery keyset cursor (sort_volume|trending_rank) + internal useMarketRefresh

BUY:     outcome click → setSelectedBet → BetSlip (docked col | overlay)
         → useBetQuote polls quote-bet 2s → usePlaceBet.mutate → rpc place_bet
         → invalidate balance/positions/position-history/trades

EVENT:   /events/:id → useEventById(id) refetch 3s + useMarketRefresh(ids,{eventId})
         → refresh-markets edge fn 30s → market_outcomes write → invalidate ['event',id]
         → desktop BetSlip auto-preselect via pickBettableOutcome

SELL:    /my-bets → usePositions + usePositionHistory → Sell → SellSlip → SellForm
         → useSellQuote polls quote-sell 2s → useSellPosition.mutate → rpc sell_position

SETTLE:  settle_market RPC (admin/cron/tracker) → bet_payout row in balance_transactions
         → Realtime INSERT (settlement_notifications_{userId}) → useBetResultNotifications toast

ADMIN:   /admin/managers/:id → ManagerProfilePage (bare supabase.from + useManagerUsers + useBetLimitSettings)
```

### Backend trust boundaries
- **Edge functions** (8, all `verify_jwt=false`, in-function auth via `_shared/edgeAuth.ts`):
  service-only (`settle-markets`), admin-only (`sync-polymarket-markets`, `export-admin-report`),
  user-facing (`quote-bet`, `quote-sell`, `refresh-markets`, `market-price-history`, `create-user`).
- **market-tracker** (Heroku, service-role, RLS bypass): persistent CLOB WS + 9 Gamma REST scheduler tasks.
- **DB RPCs** (SECURITY DEFINER, `SET search_path=public`): place_bet, sell_position, settle_market,
  quote_bet_payout, quote_sell_proceeds, bulk_upsert_*, get_sync_health, admin_*.

### Realtime publication (per-user only): `bets`, `balances`, `balance_transactions`, `profiles`
`markets`/`market_outcomes` dropped (069), `events` dropped (20260617). positions/trades NOT in pub → polled.

---

## 2. HOTSPOTS (prioritized, grouped by category)

### react-pattern
| Sev | File | Finding | Action |
|---|---|---|---|
| HIGH | pages/user/MarketsFeedPage/MarketsFeedPage.tsx:131-156 | Tab-transition skeleton via setState-during-render; two effects race the same flag (timer + isFetching). Strict-mode double-invoke creates racing setStates | Extract `useFeedTabTransition(tabKey,isFetching)` single-reducer hook |
| HIGH | pages/user/MarketsFeedPage/MarketsFeedPage.tsx:79-357 | 636-line page, 12+ useState, 6 data hooks, triple ternary chains for feedSource/Loading/Error + full BetSlip dock logic | Split into `useFeedPage()` + FeedGrid/FeedHeader/WorldCupSection |
| HIGH | pages/super-admin/ManagerProfilePage/ManagerProfilePage.tsx:27-49 | 958-line page; `fetchManagerProfile`/`fetchManagerBalance` bare `supabase.from()` in page; owns 2 modal subcomponents | Move to `features/admin/managers/` hooks; extract modals |
| HIGH | widgets/BetSlip/BetSlip.tsx:173-303 | 607-line widget embeds full placement state machine (quote fetch, drift, 2-attempt retry, refetchQueries) | Extract `usePlaceBetWithRetry` in features/bet |
| HIGH | shared/ui/BookmarkButton/BookmarkButton.tsx:4 | shared/ imports `@/features/favorites` (FSD up-violation); same in EventBookmarkButton:4 | Move bookmark family to features/favorites or inject mutation via props |
| HIGH | shared/ui/EventBookmarkButton/EventBookmarkButton.tsx:4 | Same FSD violation; natural family with BookmarkButton | Co-locate in features/favorites |
| MED | pages/super-admin/TestLabPage/TestLabPage.tsx:4 | Direct supabase.from in page (admin tool, lower risk) | Wrap in feature hook |
| MED | pages/manager/UserActivityPage/UserActivityPage.tsx:33 | Serves `/manager/activity` + `/manager/users/:id` via routeUserId check; conditional headers/cells | Split into ManagerActivityPage + UserBetHistoryPage |
| MED | app/layouts/UserLayout/UserLayout.tsx:8-30 | Layout owns useUserBalance/useMyBets/useBetResultNotifications + in-play button + drawer state | Push into `<UserShellData>` provider or header widget |
| MED | features/bet/useMarketRefresh.ts:150-180 | 2 effects w/ exhaustive-deps suppression; ref-capture (activeIdsRef/eventIdRef) invariant invisible to reviewers | Document invariant; consider stable wrapper |
| MED | features/bet/useUserBalance.ts:16-33 | Realtime channel teardown `void removeChannel` not awaited; rapid remount → dup subscription | Use channelRef guard (see useBetResultNotifications) |
| MED | features/auth/sign-in/useSignIn.ts:26-31 | awaitingRole effect has no timeout/error path; profile fetch failure → silent dead-end on sign-in | Add timeout + error surface |
| MED | features/bet/useBetResultNotifications.ts:60-85 | Secondary positions.select inside realtime callback; silent skip on replication lag (`!data`) | Add retry/timeout for context read |
| MED | widgets/BalanceWidget/BalanceWidget.tsx:80-84,140-146 | JS-mutation hover (mutates e.currentTarget.style); invisible to tests, stale-style risk | Use Tailwind hover: utilities |
| MED | widgets/MarketCard/MarketCard.tsx:70-73 | useMarketRefresh fires even when showRefreshAction=false (admin/manager readonly) | Gate hook enabled on showRefreshAction |
| MED | shared/ui/PriceHistoryChart/PriceHistoryChart.tsx:12 | shared imports PriceHistoryPoint from features/bet | Move type to entities/shared/types |
| MED | shared/ui/PriceHistoryChart/PriceHistoryWindowToggle.tsx:1 | shared imports PRICE_HISTORY_WINDOWS from features/bet | Push domain types down |
| LOW | pages/user/WalletPage/WalletPage.tsx:11 | `formatTransactionType` pure util inside page; dup'd inline in GlobalBetLog/MyBets | Extract to shared/utils or entities/transaction |
| LOW | pages/super-admin/AgentsDashboardPage/AgentsDashboardPage.tsx:104-254 | 150-line `syncDimensions` useMemo formatting logic | Extract `formatSyncHealth(health,t)` |
| LOW | pages/user/EventDetailPage/EventDetailPage.tsx:91-118 | Two setState-during-render blocks + 388 lines + role branching; zero component tests | Add tests; consider derived-state hook |
| LOW | pages/manager/ReportsPage/ReportsPage.tsx:40-52 | totalDeposits/Withdrawals/netProfit recomputed every render (no useMemo) | Wrap in useMemo([filteredTransactions]) |
| LOW | widgets/ActiveBetsDrawer/ActiveBetsDrawer.tsx:23-29 | Hand-rolled Escape listener duplicates Modal/SidePanel | Use SidePanel primitive |
| LOW | widgets/NavMarketSearch/NavMarketSearch.tsx:42-46 | setState-during-render highlight reset → double render; also data-fetching widget + app-layer import | Accept onSearch prop, lift navigation |
| LOW | features/manager/balance/.../AdjustBalanceModal.tsx:67 | exhaustive-deps suppression omits mutation to avoid render loop; fragile | Hold reset in useRef |

### test-gap
| Sev | File | Finding | Action |
|---|---|---|---|
| LOW | widgets/FinancialTransactionsTable (+ManagersReportTable, BalanceWidget, ActiveBetsDrawer, MarketCard, NavMarketSearch, TagFilter, StatusFilter, FeedSearchTools, CollapsibleSearch) | Zero component tests; admin financial tables (running totals) untested | Add tests-component coverage |
| LOW | features/admin/manage-user/useAdminUpdateUser.ts:11-23 | No onSuccess invalidation (also useToggleUserBlock/useResetPassword/useAdjustBalance/useAdjustManagerBalance) → stale UI | Invalidate ['admin','manager-users',managerId] etc |
| LOW | features/bet/useWorldCupGames.ts:63-82 | Unbounded fetch (no LIMIT), 30s poll; future perf risk as matches grow | Paginate |

### duplication
| Sev | File | Finding | Action |
|---|---|---|---|
| HIGH | supabase/functions/quote-sell/walkBids.ts | `TOP_N_LEVELS=10` vs walkAsks.ts `=100`; serializeSide copy-pasted; shallower persisted bid depth → unexpected partial-reject on thick sells | Shared constant + serializeSide in _shared/ |
| MED | pages/super-admin/MarketsPage vs pages/manager/MarketsPage | Near-identical ~260-line feeds; only diff = eventHref ROUTES.ADMIN vs ROUTES.MANAGER | One `ReadOnlyMarketsPage` with routePrefix prop |
| MED | pages/user/SavedMarketsPage/SavedMarketsPage.tsx:74-216 | Duplicates full BetSlip dock pattern + ActiveBetsDrawer + BalanceWidget from MarketsFeedPage; feed Saved tab already covers it | Consolidate / share dock logic |
| MED | pages/user/MarketsFeedPage + admin/manager MarketsPage | Feed-filter composition (TagFilter+SubTagFilter+CollapsibleSearch+FeedSearchTools+StatusFilter) triplicated (~50 lines each) | `useFeedFilters` hook + FeedFilterBar widget |
| MED | widgets/EventCard.tsx vs widgets/MarketCard.tsx | Pixel-identical card shell markup (~80 lines) at EventCard:141-151 / MarketCard:117-126 | Extract BaseCard/CardShell in shared/ui |
| MED | supabase/functions/sync-polymarket-markets/index.ts:157-170 | priceToOdds/parseJsonField dup'd from refresh-markets:43-56; MIN_TRADABLE_PRICE across 3 files | Move to _shared/ |

### dead-code
| Sev | File | Finding | Action |
|---|---|---|---|
| HIGH | services/market-tracker/src/db/queries.ts:210-232 + subscriptionManager.ts:87 | Reads frozen `bets` for trackability/auto-subscribe; positions-only markets miss WS tracking up to 5min | Switch to `positions.status='open'` |
| MED | pages/manager/TreasuryPage/TreasuryPage.tsx | Working page, no route in Router.tsx / no ROUTES.MANAGER.TREASURY | Wire up or delete |
| HIGH | supabase/functions/sync-polymarket-markets/index.ts:480-503,593-599 | backfill/hot_set query frozen `bets` (open) → returns 0 forever → silent no-op | Query `positions` (open) |
| LOW | shared/types/database.ts:76-87 | DbBet interface, zero consumers (bets frozen); could mislead | Add deprecation comment |
| LOW | supabase/migrations/20260525143143_my_bet_limit_rpc.sql | my_bet_limit may be redundant now place_bet gates internally | Verify FE still calls it |
| LOW | services/market-tracker/src/monitoring/alerting.ts:10-25 | `gamma_unavailable` AlertKind never emitted; webhook fetch has no timeout | Remove dead kind; add timeout |

### perf
| Sev | File | Finding | Action |
|---|---|---|---|
| MED | features/bet/useEventById.ts:23-55 | 2 sequential reads/3s (event then markets w/ outcome join); ~20 round-trips/min/tab | Single join RPC |
| MED | features/admin/bet-limits/useBetLimitSettings.ts:73-202 | 5-6 sequential reads in one queryFn, no parallelism; 2 separate manager_user_links queries | Promise.all independent reads; merge link queries |
| MED | supabase/functions/market-price-history/index.ts:66-67 | module-level cache/inFlight are per-isolate; concurrent isolates each fan-out to CLOB; TTL per-isolate | Document; consider shared cache (KV) |
| MED | migrations/20260602131002_settle_market_on_positions.sql (get_sync_health 20260622153543:57-62) | settlement-backlog probe = 3-way join markets×market_outcomes×positions, no covering index, runs/min | Add composite index |
| LOW | shared/ui/Skeleton/Skeleton.tsx:21-24 | Inlines @keyframes shimmer per instance; CardGridSkeleton → 24+ dup style nodes | Define keyframe once in global CSS |
| LOW | migrations/057_markets_sort_volume.sql:32 | compute_market_sort_volume / trigger helpers lack search_path pin (non-SECURITY-DEFINER, low risk) | Pin search_path |
| LOW | migrations/20260618074742_fix_markets_event_visibility_denorm.sql | Old `is_visible`-only indexes kept beside new servable indexes; follow-up drop never done | Drop redundant indexes |

### types
| Sev | File | Finding | Action |
|---|---|---|---|
| HIGH | shared/ui/Button/const.ts:2-4 | BUTTON_VARIANTS use raw Tailwind (bg-blue-600/gray-200/red-600), bypass OKLCH tokens; Button used 15+ places, off-palette both themes | Map to var(--color-accent)/--color-loss tokens |
| HIGH | features/bet/usePlaceBet.ts:66-68 | Invalidates 2-elem ['user','balance']/['user','positions']/['user','trades'] while queries register 3-elem w/ userId; prefix-match works but getQueryData(exact) would fail | Standardize on userId-suffixed keys |
| HIGH | features/bet/useSellPosition.ts:71-74 | Same 2-vs-3-elem key mismatch as usePlaceBet | Standardize keys |
| MED | shared/types/database.ts:7 | MarketStatus duplicated from entities/market/types.ts:3 | Re-export canonical from entities |
| MED | shared/types/database.ts:9 | TransactionType missing `bet_sell` (migration 20260602130345); switch checks miss sell rows | Add bet_sell |
| MED | shared/types/database.ts:89-99 | DbBalanceTransaction missing trade_id/position_id (positions migration) | Add columns |
| MED | supabase/functions/export-admin-report/index.ts:9-17 | Hand-rolled SupabaseAdminClient narrowing hides RPC signature drift | Use ReturnType<typeof createClient> |
| LOW | supabase/functions/_shared/edgeAuth.ts:25-27 | `?? ''` env fallbacks then truthiness check; no log before null return → generic 500 | Log on misconfig |
| MED | services/market-tracker/src/db/batchWriter.ts:492-540 | RPC result cast `as {settled?,error?}` unvalidated; rename breaks silently; same in tasks.ts:554-577 | Add runtime/zod validation |

### backend
| Sev | File | Finding | Action |
|---|---|---|---|
| HIGH | services/market-tracker subscriptionManager.ts:87 / queries.ts:210-232 | Realtime listener + trackability keyed on frozen `bets`; positions-only markets untracked ≤5min | Migrate to positions |
| MED | supabase/functions/create-user/index.ts:109-153 | Multi-step create with manual compensating rollbacks (no DB txn); isolate kill → partial state; cleanup errors swallowed | Wrap in single SECURITY DEFINER RPC |
| MED | shared/api/supabase/selects/eventSelect.ts:4 | EVENT_SELECT lacks `slug`; MarketEvent type lacks slug → polymarketMarketUrl 404 deep-link bug (QA 2026-06-10) | Add events.slug to select + type |
| MED | services/market-tracker resolutionDetector.ts:162-186 | WS path uses settle_market (needs outcome UUID lookup) vs main path settle_market_by_token; race → silent settle failure | Migrate WS path to settle_market_by_token |
| MED | services/market-tracker batchWriter.ts:492-530 | Inline settle_market_by_token one-at-a-time loop; 100 resolved → 100 sequential row-locking RPCs, serializes flush, tick overlap | Batch/concurrency-limit settlements |
| MED | services/market-tracker batchWriter.ts:597-840 | Legacy upsertEventWithMarkets (~240 lines) duplicates batch logic, N×2 round-trips; "no new callers" but alive | Remove once confirmed unused |
| MED | services/market-tracker queries.ts:39-63 | extractGameMeta dup'd verbatim from batchWriter.ts:183-207 (circular-import workaround) | Break circular import, single source |
| MED | services/market-tracker subscriptionManager.ts:122-161 | handleNewBet O(n) linear scan over registry per bets INSERT | Use registry.getByMarketId / Set |
| LOW | services/market-tracker syncRunWriter.ts:67-80 | closeSyncRun inverted: no-error branch sets status='running' not 'completed'; also never called → rows perpetually "running" on dashboard | Fix branch; call on shutdown |
| LOW | supabase/functions/refresh-markets/index.ts:28-33 | deriveMarketStatus includes `|| !gm.active` (closed) vs tracker batchWriter:32-38 which doesn't → parity gap | Align both runtimes |
| LOW | supabase/functions/_shared/polymarketWinner.ts:37-45 | findIndex picks first ≥0.99 without ambiguity check; tracker pickWinningTokenFromGamma returns null on ambiguity | Add ambiguity guard to edge path |

### rls-security
| Sev | File | Finding | Action |
|---|---|---|---|
| HIGH | migrations/20260611165806_restore_table_grants_local_parity.sql:21-22 | Blanket GRANT DML to anon/authenticated + ALTER DEFAULT PRIVILEGES; new RPC-only tables inherit write unless manually REVOKEd; no automated check | Add CI guard for new-table grants |
| MED | migrations/20260525143439_quote_bet_available_stake.sql:99-101 | GRANT EXECUTE quote_bet_payout to anon, revoked only in later 20260610132634 → window in historical order | Defense-in-depth REVOKE in same migration |
| MED | migrations/039_enable_missing_rls.sql:104-111 | "Managers read linked user transactions" uses manager_id=auth.uid() without profiles.role='manager' JOIN → latent IDOR | Add role check (cf positions policy) |
| MED | migrations/20260602131002_settle_market_on_positions.sql:95-99 | service_role (uid IS NULL) bypasses super_admin check; relies on external REVOKE | Add REVOKE FROM public in function body |
| MED | migrations/20260610132750_harden_rls_invariants_search_path.sql:49-60 | One-time loop pins search_path; post-audit SECURITY DEFINER fns must add inline; no enforcement | Add lint/CI for SET search_path |
| LOW | migrations/20260610153531_fix_settlement_logs_manager_rls_use_links.sql:30-42 | market_settlement_logs manager policy joins through frozen `bets`; positions-only markets → manager sees no rows | Also JOIN position_settlement_logs/positions |

### i18n
| Sev | File | Finding | Action |
|---|---|---|---|
| LOW | shared/ui/Modal/Modal.tsx:82,100 | aria-label='Close' hardcoded EN (also SidePanel:91,110; Spinner:18 'Loading') | Use t() keys |

### other (tokens/colors/values)
| Sev | File | Finding | Action |
|---|---|---|---|
| HIGH | widgets/GamesList/GameCard.tsx:5 | imports @/app/router/routes (FSD up-violation); ROUTES.USER.EVENT_DETAIL in Order Book link | Accept href prop from GamesList |
| HIGH | widgets/WorldCupMap/WorldCupMap.tsx:5 | imports @/app/router/routes for buildPath+ROUTES in handleSelect | Receive resolved path from page |
| MED | widgets/NavMarketSearch/NavMarketSearch.tsx:6 | imports @/app/router/routes + useNavigate directly | Lift navigation to layout |
| LOW | shared/ui/Modal/Modal.tsx:40 | backdrop rgba(0,0,0,0.6) hardcoded | Tokenize --color-modal-backdrop |
| LOW | shared/ui/LanguageSwitcher:16 (+OutcomeButtons:96, PriceHistoryWindowToggle:36) | hardcoded #fff / oklch(100%) instead of --color-accent-contrast | Tokenize |
| LOW | shared/ui/PriceHistoryChart/priceHistoryPalette.ts:3-11 | OKLCH literals duplicate tokens.css (SVG can't read CSS vars — unavoidable, undocumented) | Document token mapping |
| LOW | features/bet/useMarkets.ts:182-186 (+useMarketRefresh:112) | console.log behind import.meta.env.DEV | Remove before ship |

> **Codemap drift note:** `colorsByTheme` (CLAUDE.md) does NOT exist; `OddsBar`/`ProbabilityGauge` (CLAUDE.md catalogue) do not exist — `ChanceGauge` is the actual gauge. entities/balance,manager,outcome,transaction,user are empty .gitkeep placeholders. MyBetsPage is now positions-based (not useMyBets). close_expired_markets() DROPPED (20260622165744). VOLUME_THRESHOLD lowered 500k→200k.

---

## 3. market-tracker Deep Dive (services/market-tracker/)

Long-running Node 22 / TS ESM service, single Heroku Basic dyno (512MB). Primary data pipeline.
Writes Supabase via service-role key (RLS bypassed). Absent from any prior codemap.

### Startup (index.ts, 9 phases)
```
health server → sync_run init → subscriptionManager bootstrap → priceBuffer → bookWriter
→ CLOB WS connect → Realtime bets listener → scheduler tickLoop → memory monitor
SIGTERM → graceful shutdown
```

### Data flow
```
CLOB WS (wss://ws-subscriptions-clob.polymarket.com)
  parseClobFrame → handleMessage (book | price_change[2 shapes] | last_trade_price | best_bid_ask | market_resolved)
    price ticks → priceBuffer.set (drop <PRICE_MIN_DELTA=0.001)
       → setInterval 1000ms flushBuffer → rpc flush_outcome_prices → touchMarketsSynced
       → significant delta (>=DELTA_MIN_THRESHOLD=0.05) → market_data_deltas.insert
    book frames → bookWriter.books.set (full bid/ask Maps)
       → setInterval 1000ms → serializeSide(top-10) → market_outcome_books.upsert (chunks 100, hash-dedup)
       → re-mark dirty on upsert failure

Gamma REST (gammaClient.fetchJsonWithRetry: 3 attempts 500/1000/2000ms, 20s timeout)
  scheduler tickLoop (per-task in-flight guard + error isolation):
    eventCrawl        5m  → CATEGORY_WHITELIST (10) → streamEvents(500/pg, maxPages=10) → flush 300/chunk
                            → upsertEventsBatch (3-RPC: bulk_upsert_events/markets/outcomes + inline settle)
                            → subscribeNewMarkets → registry.addMarket → WS subscribe
    lifecycleCrawl    10m → status transitions
    resolutionScan    2m  → fetchResolved(2pg)+fetchLimbo(1pg) → handleMarketResolvedEvent
    settlePendingBets 1m  → rpc settle_pending_bets(50)
    reconcileStrandedBets 3m → rpc list_stranded_bets_unknown_winner → settle_market_by_token
    syncTrendingRankings 5m → fetchTrendingEvents → rpc set_events_trending_rankings
    refreshCategorySubtags 1h → selectRankedRelatedTags → filterSlugsWithMarkets → system_settings.category_subtags
    archiver         30m  → archive resolved >168h + cascade_event_lifecycle
    cascadeEventsTick 5m  → cascade_event_lifecycle

MarketRegistry (in-memory): 3 Maps {marketId→TrackedMarket, tokenId→TrackedOutcome, polymarketId→marketId}, O(1)
heartbeat 10s → system_settings.tracker_heartbeat {ws_connected, subscribed_tokens, last_trending_at}
clobBookBackfill (cold-start, concurrency=20) → CLOB REST /book → applyBookSnapshot before first WS frame
```

### Resolution = 3 cascading channels
1. WS `market_resolved` → settleMarket
2. price≥0.99 heuristic → Gamma confirm → settleMarket
3. periodic Gamma resolutionScan
(30s per-market cooldown; DB fallback when market not in registry)

### Key config (config.ts)
PRICE_BUFFER_FLUSH_MS=1000 (README stale says 200), DELTA_MIN_THRESHOLD=0.05 (README stale 0.01),
VOLUME_THRESHOLD_USD=200000 (was 500k), EVENT_CRAWL_MAX_PAGES=10, CATEGORY_WHITELIST=10 (incl world-cup polymarketSlugs[]).

### Critical issues (see hotspots)
- **HIGH** frozen-`bets` dependency in subscriptionManager + queries → positions-only markets untracked ≤5min.
- **MED** WS settle uses settle_market (UUID lookup race) vs settle_market_by_token everywhere else.
- **MED** inline per-market settle loop serializes large flushes; **MED** unvalidated RPC result casts.
- **LOW** closeSyncRun inverted-status bug + never called → dashboard shows perpetual "running".
- Parity gaps vs edge functions: deriveMarketStatus `!active`, winner-ambiguity handling, gammaUrls dual-call (mirrored OK).

---

## 4. Top 10 Behavior-Preserving Refactor Candidates

1. **Unify CLOB book-walk serialization** — extract `serializeSide` + single `TOP_N_LEVELS` into `_shared/` consumed by quote-bet/walkAsks, quote-sell/walkBids, market-tracker/bookWriter. Fixes the 10-vs-100 depth divergence (silent partial-reject bug). HIGH value, low risk.
2. **Standardize TanStack query keys to userId-suffixed** — usePlaceBet/useSellPosition invalidations to 3-elem `['user',domain,userId]`. Removes exact-match fragility; matches useBetResultNotifications.
3. **`ReadOnlyMarketsPage` with routePrefix prop** — collapse super-admin + manager MarketsPage (~260 lines each) into one. Eliminates triplication of feed UI.
4. **Extract `useFeedFilters` + `FeedFilterBar`** — dedupe TagFilter+SubTagFilter+CollapsibleSearch+FeedSearchTools+StatusFilter across MarketsFeedPage + 2 readonly pages (~50 lines × 3).
5. **`usePlaceBetWithRetry` hook (features/bet)** — lift BetSlip:173-303 placement state machine out of the 607-line widget. Testable in isolation.
6. **Move bookmark family to features/favorites** — remove the FSD up-violation in shared/ui/BookmarkButton + EventBookmarkButton (shared→features imports).
7. **`BaseCard`/`CardShell` in shared/ui** — extract pixel-identical card shell shared by EventCard + MarketCard (~80 dup lines).
8. **`ManagerProfile` feature hooks + modal extraction** — pull bare supabase.from out of the 958-line ManagerProfilePage into `features/admin/managers/`; extract AdjustBalanceModal/ResetPasswordModal.
9. **Single price-history `@keyframes shimmer`** — move out of per-instance Skeleton `<style>` into global CSS (cuts 24+ dup DOM style nodes per grid).
10. **Lift app-router imports out of widgets** — GameCard/WorldCupMap/NavMarketSearch accept resolved href/onSelect props instead of importing @/app/router/routes (FSD up-violations).

---

## 5. Top 10 Test-Coverage Gaps

1. **EventDetailPage** — 388 lines, role-aware readonly branching, 2 setState-during-render blocks, deep-link `?market=` preselect; zero component tests. (pages/user/EventDetailPage)
2. **Admin financial table widgets** — FinancialTransactionsTable, ManagersReportTable (running totals, deposit/withdrawal sums) have zero component tests.
3. **market-tracker scheduler tasks** — reconcileStrandedBets, settlePendingBets, syncTrendingRankings, refreshCategorySubtags, archiver, cascadeEventsTick: no unit/integration tests (only config constants tested).
4. **market-tracker batchWriter.upsertEventsBatch** — primary ingest pipeline (~290 lines), inline settlement Phase 6, isPlaceholderMarket filter: untested. pickWinningTokenFromGamma only indirectly via fixture.
5. **market-tracker clobWebSocket.handleMessage** — dual price_change shapes (past incident "FIX-2"), book/best_bid_ask/last_trade dispatch untested (only parseClobFrame tested).
6. **refresh-markets settlement path** — resolveWinnerTokenId → fetchJsonWithRetry → settle_market triggered inline by refresh has no tests-db coverage (settle_market tested independently only).
7. **Admin mutation cache invalidation** — useAdminUpdateUser/useToggleUserBlock/useResetPassword/useAdjustBalance: no onSuccess invalidation AND no tests asserting stale-UI behavior.
8. **Sell-flow E2E** — no seed positions/trades/market_outcome_books rows (seed only admin_action_logs + sync_runs); E2E sell needs factory setup. Known gap in CLAUDE.md.
9. **settle-markets CRON_SECRET empty-string guard** — edgeAuth `cronSecret.length>0` guard not tested in tests-db.
10. **useWorldCupGames unbounded fetch** — groupGames exported (good) but the no-LIMIT fetch perf boundary is untested as match count grows.
