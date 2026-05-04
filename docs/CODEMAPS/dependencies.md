<!-- Generated: 2026-05-04 | Token estimate: ~400 -->

# Dependencies

## External services

| Service | Use | Auth |
|---|---|---|
| Supabase Postgres | Primary data store | RLS via JWT |
| Supabase Auth | User identity | email/password |
| Supabase Realtime | Per-user push (bets/balances/transactions/profiles) | gateway + RLS |
| Supabase Storage | unused |
| Supabase Edge Functions | refresh-markets, sync-polymarket-markets, settle-markets, market-price-history, export-admin-report, create-user | JWT validated in-function (`verify_jwt = false` in config.toml) |
| Polymarket Gamma API | Price/event source for sync | public |
| pg_cron | Scheduled sync + market closure | service role |
| pg_net | HTTP from cron jobs to edge functions | superuser |
| Vercel | SPA hosting | env vars |

## Runtime libraries

```
@supabase/supabase-js      ^2.78         REST + Realtime client
@tanstack/react-query      ^5.90         server state, polling, cache
react / react-dom          ^19.2         UI
react-router-dom            ^7.13         routing
react-i18next / i18next     ^16.5/25.8   i18n + RTL
i18next-browser-languagedetector ^8.2    auto-detect locale
recharts                    ^3.8          charts (PriceHistoryChart)
sonner                      ^2.0          toast notifications
zustand                     ^5.0          lightweight client state
```

## Build tooling

```
vite                       ^5.4
tailwindcss                ^3.4          (NOT v4 — design tokens via CSS vars in tokens.css)
typescript                 ~5.9          strict
eslint / typescript-eslint ^9 / ^8       linting
prettier                   ^3.8
@vitejs/plugin-react       ^4.7
postcss / autoprefixer
tsx                        ^4.8          test runner (`tsx --test tests/*.test.ts`)
```

## Internal helpers

```
src/shared/api/supabase/index.ts                Supabase client singleton (env-driven)
src/shared/api/supabase/invokeSupabaseFunction  authenticated edge fn caller
src/shared/i18n/index.ts                        i18next bootstrap (side-effect import in App.tsx)
src/shared/theme/                               token map + colorsByTheme (recharts series)
src/shared/hooks/{useAuth, useTheme, …}         context accessors
```

## Environment

```
VITE_SUPABASE_URL          Supabase project URL
VITE_SUPABASE_ANON_KEY     Supabase anon key
```

Edge functions also read project secrets via `Deno.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Polymarket API base, etc. (see each `supabase/functions/<name>/index.ts`).
