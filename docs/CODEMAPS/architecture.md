<!-- Generated: 2026-06-03 (positions/trades trading model) | Files scanned: ~250 | Token estimate: ~600 -->

# Architecture

Single Vite SPA + Supabase backend (Postgres + Edge Functions). Polymarket sync via cron-driven edge function.

## Data flow

```
Polymarket API
   │
   ▼
sync-polymarket-markets (edge fn, pg_cron every 1m)
   │ writes
   ▼
events ─────► markets ──────► market_outcomes
   │            │              (price/odds)
   │            │
   │  [denorm via triggers: sort_volume, tag_slugs]
   │
   ▼
[Supabase REST/RPC + Realtime] ◄───── React SPA
                                       │
   refresh-markets (on-demand)  ◄──────┤  TanStack Query hooks
   place_bet / sell_position    ◄──────┤
   quote-bet / quote-sell       ◄──────┤
   settle_market (RPC, cron)    ◄──────┘

User actions (TRADING MODEL — positions + trades; `bets` FROZEN):
  buy           → place_bet RPC     → upsert positions + buy trade + lock in_play (bet_lock)
  sell          → sell_position RPC → reduce position + sell trade + credit available (bet_sell)
  market close  → close_expired_markets() (every minute, see migration 045)
  market resolve → settle_market RPC → settle open POSITIONS (win: shares*$1, lose: 0)
```

## Layering (Feature-Sliced Design)

```
src/app       (providers · router · layouts · route guards)
src/pages     (route-level components, role-grouped)
src/widgets   (composite blocks reused across pages)
src/features  (domain hooks + UI: auth, bet, favorites, wallet, admin, manager, super-admin, stats)
src/entities  (domain primitives: balance, bet (frozen), position+trade, manager, market, outcome, transaction, user)
src/shared    (api · config · hooks · i18n · theme · types · ui · utils)
```

Imports flow top-down only. No same-layer cross-imports — go through `shared`.

## Boundaries

- **Frontend ↔ Postgres**: PostgREST through `@supabase/supabase-js`. All reads/writes wrapped in `useQuery`/`useMutation` hooks under `src/features/<domain>/`.
- **Frontend ↔ Edge functions**: `invokeSupabaseFunction` (refreshes auth bearer per call).
- **App ↔ DB**: RLS on all `public.*` tables. Mutating endpoints go through SECURITY DEFINER RPCs (`place_bet`, `settle_market`, etc.) which bypass RLS as `postgres`.
- **Polymarket sync ↔ DB**: edge function authenticates with service role, calls `bulk_upsert_events` then `bulk_upsert_markets` (migrations 060/064/065).
- **Realtime publication**: only `bets`, `balances`, `balance_transactions`, `profiles`, `events`. `markets` and `market_outcomes` were dropped in migration 069 — quota-driven decision; see CLAUDE.md "Realtime policy".

## Build & ops

- Vite 5 build → static dist served by Vercel.
- Type-check: `tsc -b` (strict mode).
- Tests: `tsx --test` against `tests/*.test.ts`.
- Migrations: `supabase db push` (autocommit / pipeline mode — no `SET LOCAL`, no `CREATE INDEX CONCURRENTLY`; see migration 070 header).
