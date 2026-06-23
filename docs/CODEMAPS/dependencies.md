<!-- Generated: 2026-06-23 | scanned: 2x package.json, config.toml, 8 edge fns, market-tracker src | ~950 tokens -->

# Dependencies

## External services

| Service | Use | Auth |
|---|---|---|
| Supabase Postgres | Primary data store (positions+trades exchange model; `bets` frozen) | RLS via JWT |
| Supabase Auth | User identity | email/password, session in `sessionStorage` |
| Supabase Realtime | Per-user push ONLY. Publication: `bets`, `balances`, `balance_transactions`, `profiles`. NOT `markets`/`market_outcomes`/`events`/`positions`/`trades` | RLS, `user_id=eq.` filter |
| Supabase Edge Functions (8) | `quote-bet`, `quote-sell`, `refresh-markets`, `market-price-history`, `create-user`, `sync-polymarket-markets`, `settle-markets`, `export-admin-report` | `verify_jwt=false` in config.toml; in-function authz (`authorizeEdgeCall`) |
| Polymarket Gamma REST | Event/market/price discovery + winner resolution | public |
| Polymarket CLOB (REST + WS) | Order book (asks/bids) for quotes; live price WS | public |
| Heroku (market-tracker dyno) | 24/7 sync runtime (WS + Gamma scheduler) | service-role key |
| pg_cron + pg_net | Scheduled edge-fn sync (complementary to tracker) | service role / superuser |
| Vercel | SPA hosting; CORS origin `https://polybet-mu.vercel.app` | env vars |

Two sync runtimes share conflict-safe upserts on `polymarket_id` + idempotent `settle_market`. Fix sync logic in BOTH edge fns AND market-tracker.

## Frontend runtime libs (polybet/package.json, v0.3.13)

```
@supabase/supabase-js        ^2.78.0    REST + Realtime + Auth
@tanstack/react-query        ^5.90.21   server state, polling, infinite query
react / react-dom            ^19.2.0    UI
react-router-dom             ^7.13.1    routing (ROUTES + buildPath)
i18next                      ^25.8.13   i18n core
react-i18next                ^16.5.4    React bindings (EN/HE, RTL)
i18next-browser-languagedetector ^8.2.1 locale auto-detect
recharts                     ^3.8.1     PriceHistoryChart
sonner                       ^2.0.7     toasts
zustand                      ^5.0.12    lightweight client state
cobe                         ^0.6.5     WebGL globe (WorldCupMap, lazy-loaded)
flag-icons                   ^7.5.0     country flags (WorldCupHero)
```

## Frontend build / tooling

```
vite                  ^5.4.21    bundler
@vitejs/plugin-react  ^4.7.0
tailwindcss           ^3.4.19    v3 (NOT v4) — tokens via CSS vars in tokens.css
typescript            ~5.9.3     strict
eslint                ^9.39.1    + typescript-eslint ^8.48 + react-hooks ^7 (react-compiler ruleset) + react-refresh
prettier              ^3.8.1
postcss / autoprefixer ^8.5 / ^10.4
knip                  ^6.12.1    dead-code (npm run lint:dead)
tsx                   ^4.8.1     node:test runner (tests/)
vitest                ^4.1.5     + @vitest/coverage-v8 — component + db projects
jsdom                 ^29.1.1    component-test DOM
msw                   ^2.14.6    network mocking (tests-component)
@testing-library/{react ^16.3, user-event ^14.6, jest-dom ^6.9}
pg ^8.20 / @types/pg          tests-db live pg (:54422)
@playwright/test      ^1.59.1    e2e
@tanstack/react-query-devtools ^5.91.3
```

## market-tracker libs (services/market-tracker/package.json, v1.0.0, Node 22 ESM)

```
@supabase/supabase-js  ^2.49.4   service-role writes (RLS bypassed)
ws                     ^8.18.0   persistent CLOB WebSocket
pino                   ^9.6.0    structured logging
--- dev ---
tsx                    ^4.19.0   dev runner + node:test
typescript             ^5.7.0
@types/node ^22 / @types/ws ^8.5
```
Tests: `tsx --test` (priceMath, marketRegistry, clobFrame, tagSlugs, categoryWhitelist, Gamma fixture-contract). No Vitest. Live Gamma smoke under `TEST_GAMMA_LIVE=1`.

## Internal helpers (frontend)

```
src/shared/api/supabase/client.ts                singleton; THROWS on missing env (no ?? '' fallback)
src/shared/api/supabase/invokeAuthedFunction.ts  60s expiry-skew refresh + single 401-retry-force-refresh (v0.3.13, 9e51938)
src/shared/api/supabase/invokeSupabaseFunction.ts thin wrapper binding singleton client
src/shared/api/supabase/selects/{marketSelect,eventSelect}.ts  MARKET_SELECT_FULL/_NO_EVENT, EVENT_SELECT (NOTE: EVENT_SELECT lacks events.slug)
src/shared/i18n/index.ts                          i18next bootstrap (side-effect import in App.tsx)
src/shared/theme/{tokens.css,const.ts}            OKLCH tokens (:root dark, [data-theme=light]); colorsByTheme does NOT exist (PriceHistoryChart uses hardcoded OKLCH)
src/shared/hooks/{useMediaQuery,useHorizontalScroll,useTheme,...}
src/shared/utils/                                  formatVolume, formatSharePrice, polymarketMarketUrl, dedupeSavedMarkets, ...
```

## Internal shared (edge functions, `supabase/functions/_shared/`)

```
edgeAuth.ts + edgeAuthRules.ts   authorizeEdgeCall: service-role/CRON_SECRET | user-JWT+role allowlist | reject
cors.ts                          PROD_ALLOW_ORIGIN lock, jsonWithCors
gammaFetch.ts / gammaUrls.ts     retry+backoff; dual closed=false/true fetch
marketDataDelta.ts, marketLifecycle.ts, syncRunProgress.ts, polymarketWinner.ts
```
Duplication watch: `serializeSide`/`BookLevel` copied across `quote-bet/walkAsks.ts` (TOP_N=100), `quote-sell/walkBids.ts` (TOP_N=10 — DIVERGES), and tracker `bookWriter.ts`. `priceToOdds`/`parseJsonField`/`MIN_TRADABLE_PRICE` duplicated edge↔tracker.

## Environment

```
# Frontend (Vite)
VITE_SUPABASE_URL          Supabase project URL
VITE_SUPABASE_ANON_KEY     anon key

# Edge functions (Deno.env)
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
CRON_SECRET                cron/service bearer
CORS_ALLOW_ORIGIN          override (default vercel prod)

# market-tracker (Heroku)
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
PORT (3100), HEALTH_METRICS_TOKEN  (Bearer for /health full metrics)
ALERT_WEBHOOK_URL          Slack/Telegram alerts
```

Local Supabase ports shifted to 544xx (config.toml `project_id="polybet"`). Read keys live via `npx supabase status -o env` — never hardcode.
