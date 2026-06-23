<!-- Generated: 2026-06-23 | scanned: src/ (app/pages/widgets/features/entities/shared), supabase/{migrations~146,functions×8}, services/market-tracker | ~950 tokens -->

# Architecture

Vite SPA + Supabase (Postgres + 8 Edge Functions) + market-tracker (Heroku 24/7 dyno).
Polymarket sync is **dual-runtime**: the always-on market-tracker is the primary pipeline;
edge functions are user-triggered / cron fallbacks. Both upsert on `polymarket_id` unique keys
and call the idempotent `settle_market` RPC, so they are conflict-safe.

## Data flow

```
                         Polymarket
              ┌──────────────┴───────────────┐
        Gamma REST                       CLOB WS + REST
              │                               │
  ┌───────────┴───────────┐        ┌──────────┴──────────────┐
  │ MARKET-TRACKER (Heroku, primary)                          │
  │  eventCrawl 5m · lifecycleCrawl 10m · resolutionScan 2m   │
  │  settlePendingBets 1m · reconcileStranded 3m · archiver   │
  │  syncTrendingRankings 5m · refreshCategorySubtags 1h      │
  │  clobWebSocket → priceBuffer(1s) → flush_outcome_prices   │
  │              → bookWriter(1s) → market_outcome_books      │
  │  heartbeat 10s → system_settings.tracker_heartbeat        │
  └───────────┬───────────────────────────────┬──────────────┘
              │ service-role (RLS bypass)      │
  ┌───────────┴──────────┐                     │
  │ EDGE FNS (fallback/user, verify_jwt=false) │
  │  sync-polymarket-markets (cron, 5 modes)   │
  │  settle-markets (service-only)             │
  │  refresh-markets / quote-bet / quote-sell  │ ◄─ user-triggered
  │  market-price-history / export-admin / create-user
  └───────────┬──────────────────────────────┘
              ▼ bulk_upsert_events → bulk_upsert_markets → bulk_upsert_outcomes
   events ──► markets ──► market_outcomes / market_outcome_books (CLOB cache)
     │  [triggers denorm onto markets: sort_volume, tag_slugs,
     │   trending_rank/volume_24hr, event_is_visible]
     ▼
  [PostgREST + RPC + Realtime] ◄──── React SPA (TanStack Query hooks)

TRADING MODEL — positions + trades exchange; `bets` FROZEN (read by nothing app-facing):
  buy            → place_bet RPC     → upsert positions + buy trade  + lock in_play (bet_lock)
  sell           → sell_position RPC → reduce position + sell trade  + credit available (bet_sell)
  market resolve → settle_market RPC → settle open POSITIONS (win shares*$1, lose 0)
  NOTE: close_expired_markets() was DROPPED (migration 20260622165744). No time-based closure —
        status authority is exclusively Polymarket closed/resolved flags via lifecycle/resolution scans.
```

Freshness on SPA: feed/event poll DB every 3s (patchVisibleFromDb / useEventById) + 30s edge
`refresh-markets` safety pull. Sub-second WS freshness comes from the tracker, not the SPA.

## Layering (Feature-Sliced Design)

```
src/app       providers (ThemeProvider→QueryProvider→AuthProvider→RTLProvider) · router · layouts · RoleGuard
src/pages     route-level, role-grouped (auth · user · super-admin · manager); EventDetailPage shared 3 roles via readonly prop
src/widgets   composite blocks (BetSlip · EventCard · MarketCard · ActiveBetsDrawer · feed filters · World Cup)
src/features  domain hooks ~65 (auth · bet · favorites · wallet · admin · manager · super-admin · stats)
src/entities  populated: bet (adapter) · event · market · position; empty .gitkeep: balance · manager · outcome · transaction · user
src/shared    api · config · hooks · i18n(en/he) · theme(OKLCH tokens) · types · ui(~26) · utils
```

Imports flow top-down only; no same-layer cross-imports. Known FSD violations (open): shared/ui
`BookmarkButton`/`EventBookmarkButton`/`PriceHistoryChart` import features/; widgets `GameCard`/`WorldCupMap`/`NavMarketSearch` import app/router.

## Boundaries

- **SPA ↔ Postgres**: PostgREST via supabase-js, always inside `useQuery`/`useMutation` hooks in `features/<domain>/`. Never call the client from a component.
- **SPA ↔ Edge fns**: `invokeSupabaseFunction` → `invokeAuthedFunction` (60s expiry-skew refresh + one 401-retry-with-force-refresh).
- **App ↔ DB**: RLS on all `public.*`. Mutations via SECURITY DEFINER RPCs (`place_bet`/`sell_position`/`settle_market`) with `SET search_path=public`. Feed RLS uses local `event_is_visible` (no correlated subquery — fixed feed statement timeouts, mig 20260618).
- **Sync ↔ DB**: tracker + sync edge fn auth with service-role key; `bulk_upsert_*` RPCs (service_role only).
- **Edge auth**: gateway `verify_jwt=false` for all 8; in-function `authorizeEdgeCall` (service-role/CRON_SECRET tier · user-JWT+role-allowlist tier · anon-reject). CORS locked to vercel domain in prod.
- **Realtime publication** (per-user filtered only): `bets`, `balances`, `balance_transactions`, `profiles`. Dropped: `markets`/`market_outcomes` (mig 069), `events` (mig 20260617). `positions`/`trades` NOT in publication — polled.

## Build & ops

- Vite 5 build (`tsc -b` strict + build) → static dist on Vercel.
- Tests: node:test (`tests/`), Vitest component (`tests-component/`, jsdom+MSW) + db (`tests-db/`, live pg BEGIN/ROLLBACK), Playwright e2e (`e2e/`). market-tracker has its own node:test suite.
- Migrations: ~146 files (legacy `001-075` numeric, applied; new are timestamp-prefixed — never hand-edit timestamps). `supabase db push`.
- market-tracker: Heroku Basic dyno ($7/mo, 512MB), Node 22 ESM, service-role key, `/health` (Bearer HEALTH_METRICS_TOKEN for metrics). Dashboard liveness via `get_sync_health()` RPC (60s poll).
