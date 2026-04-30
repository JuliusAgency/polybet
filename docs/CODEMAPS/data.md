<!-- Generated: 2026-05-01 | Tables scanned: 16 public + 70 migrations | Token estimate: ~700 -->

# Data

Postgres 17 (Supabase managed). All `public.*` tables RLS-enabled. ~157k markets, ~198k market_outcomes, ~10k events, ~436k market_data_deltas (audit log).

## Schema

```
profiles (id PK = auth.users.id, role: user|manager|super_admin, blocked, full_name)
   │
   ├──► managers          (id PK = profiles.id, agent_code, settings)
   │      │
   │      └─► manager_user_links  (manager_id ↔ user_id)
   │
   ├──► balances          (user_id PK, available, in_play)
   │
   ├──► bets              (id, user_id, market_id, outcome_id, stake, locked_odds,
   │                       potential_payout, status: open|won|lost|cancelled,
   │                       placed_at, settled_at, seen_at)
   │
   └──► balance_transactions  (id, user_id, type: mint|transfer|bet_lock|
                               bet_payout|adjustment, amount, balance_after,
                               bet_id?, note, created_at)

events  (id, polymarket_id, title, description, category, image_url, close_at,
         status, volume, tag_slug, tag_label, tag_slugs[])
   │
   └──► markets  (id, polymarket_id, question, status: open|closed|resolved|archived,
                  winning_outcome_id?, category, image_url, close_at,
                  is_visible, last_synced_at, created_at, volume, sort_volume,
                  event_id?, group_label, tag_slugs[],
                  polymarket_slug, source_updated_at)
          │
          ├──► market_outcomes  (id, market_id, name, price, odds, effective_odds,
          │                      polymarket_token_id, updated_at)
          │
          └──► user_favorite_markets  (user_id ↔ market_id)

market_settlement_logs  (market_id, winning_outcome_id, settled_at, …)
bet_settlement_logs     (market_settlement_id, bet_id, user_id, outcome, stake, payout)

system_settings    (key text PK, value jsonb) — runtime config:
  market_volume_threshold_usd, allowed_category_tags

admin_action_logs  (actor_id, action, target_id, payload jsonb, created_at)
sync_runs          (per-cron-tick sync stats — markets_synced, outcomes_updated, errors)
market_data_deltas (large audit table of price/odds changes — not user-facing)
```

## Denormalized columns on `markets`

Maintained by triggers — do NOT write directly from app code.

| Column | Mirror of | BEFORE/AFTER | Index |
|---|---|---|---|
| `sort_volume` | `events.volume` (fallback `markets.volume`, default 0) | `markets_set_sort_volume` BEFORE INSERT/UPDATE; `events_propagate_sort_volume` AFTER UPDATE OF volume | `idx_markets_visible_sort_volume` (sort_volume DESC, created_at DESC, id DESC) |
| `tag_slugs` | `events.tag_slugs[]` (default `'{}'`) | `markets_set_tag_slugs` BEFORE INSERT/UPDATE OF event_id (early-exit if unchanged); `events_propagate_tag_slugs` AFTER UPDATE OF tag_slugs | `idx_markets_tag_slugs_visible` GIN partial WHERE is_visible |

## RLS summary

```
profiles          read: self | linked manager | super_admin
managers          read: self | super_admin                                writes via RPC
balances          read: self | linked manager | super_admin               writes via RPC
bets              read: self | linked manager | super_admin               writes via RPC
balance_transactions  read: self | linked manager | super_admin           writes via RPC
markets, market_outcomes, events  read: anyone (public feed)              writes via service role (sync)
user_favorite_markets  read/write: self
admin_action_logs / sync_runs / market_settlement_logs   read: super_admin
system_settings   read: anyone (read-only, e.g. category whitelist)       writes via RPC
```

## Realtime publication (`supabase_realtime`)

Currently published: `bets`, `balances`, `balance_transactions`, `profiles`, `events`.

Removed in migration 069 (quota-driven): `markets`, `market_outcomes`. Re-adding either is a billing/perf decision — see CLAUDE.md "Realtime policy".

## Migration timeline (highlights)

```
001  initial schema (auth, profiles, balances, markets, bets, transactions)
004  Polymarket sync foundations + idx_markets_is_visible
006  manager balance block cascade + profiles in realtime publication
007  balance_transactions in realtime publication
008  manager RPCs/RLS + bets in realtime publication
014  pg_cron jobs for market sync (later partially retired in 055)
024  balances in realtime publication
027  market_archive + KPI rollups + settlement helpers
029  Polymarket hot-set / minute cron + deltas
038  bets RLS enabled + markets in realtime
041  place_bet uses effective_odds
043  market_outcomes in realtime
045  auto_close_expired_markets + per-minute cron
048  events table + event_id on markets
055  drop legacy sync cron jobs (fold into hot_set)
057  markets.sort_volume denormalization
060/063/064  bulk_upsert_* refactors
061  events.tag_slugs (text[])
065  bulk_upsert_events unions tag_slugs on conflict
066  partial close_at index
067  settle idempotent on bets
068  cleanup demo bets
069  markets.tag_slugs denorm + DROP markets/market_outcomes from realtime
070  backfill markets.tag_slugs (BEGIN/COMMIT + SET LOCAL timeout=0) + GIN index
```

## Seeds (`supabase/seed/`)

```
001_super_admin.sql        — super_admin profile + auth.users seed
002_test_users.sql         — manager + N test users + balances
003_betting_history.sql    — admin_action_logs / sync_runs notice only; no markets/bets
```

Whenever a migration tightens schema, audit and update seed files in the same change (per `~/.claude/CLAUDE.md`).
