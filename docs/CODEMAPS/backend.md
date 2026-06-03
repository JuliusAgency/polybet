<!-- Generated: 2026-06-03 (positions/trades trading model) | Files scanned: ~70 migrations + 6 edge fns | Token estimate: ~700 -->

# Backend

Supabase Postgres 17 + Edge Functions (Deno). All app-facing edge functions validate JWT in-function via `auth.getUser()` then check `profiles.role` (see CLAUDE.md "Edge Functions JWT Policy"). `verify_jwt = false` is the standard in `supabase/config.toml`.

## Edge Functions

| Function | Purpose | Auth | Triggered by |
|---|---|---|---|
| `create-user` | Admin/manager creates user + initial balance | service-role only | manager UI |
| `export-admin-report` | CSV export of bets/transactions | user JWT + super_admin role | admin UI button |
| `market-price-history` | Returns bucketed price points for a market or event | user JWT (any role) | bet/event detail charts |
| `refresh-markets` | On-demand Polymarket pull for given polymarket_ids; writes outcomes; settles resolved | user JWT (user/manager/super_admin) | `useMarketRefresh` (feed + event page, every 30s) |
| `quote-bet` | Walks live CLOB **asks** for a stake; upserts order book; returns slippage payout | user JWT | `useBetQuote` (BetSlip Buy) |
| `quote-sell` | Walks live CLOB **bids** for N shares; upserts order book; returns sell proceeds | user JWT | `useSellQuote` (SellSlip / BetSlip Sell) |
| `settle-markets` | Bulk settle resolved markets | service-role only | manual admin trigger |
| `sync-polymarket-markets` | Full sync — events + markets + outcomes (modes: hot_set, backfill, resolved_only, event_first) | service-role only | pg_cron (`sync-hot-set-markets` every 1m, `backfill-open-bets` every hour) |
| `_shared/` | Common utilities (auth, polymarket client, types) | — | imported by all of the above |

## Critical RPCs (SECURITY DEFINER)

TRADING MODEL: positions + trades (`bets` FROZEN). See CLAUDE.md "Trading model".
```
place_bet(market_id, outcome_id, stake, expected_odds)        — BUY
  → upsert positions (weighted-avg) + INSERT trades(side=buy) + in_play += cost
    + balance_transactions(bet_lock). Requires fresh (≤5s) book quote. Returns position id.

sell_position(position_id, shares, expected_price)            — SELL (partial/full)
  → quote_sell_proceeds walks bids → available += proceeds, release cost_basis from in_play,
    realized_pnl, INSERT trades(side=sell) + balance_transactions(bet_sell). ERRCODE P0002 on drift.

quote_bet_payout(token_id, stake) / quote_sell_proceeds(token_id, shares)
  → STABLE; walk market_outcome_books.asks / .bids for slippage-adjusted payout / proceeds.

settle_market(market_id, winning_outcome_id)
  → settle open POSITIONS: winner += shares*$1, loser += 0, both release cost_basis from in_play
  → INSERT market_settlement_logs + position_settlement_logs. Idempotent on positions.

admin_place_demo_bet(user_id, market_id, outcome_id, stake)   — TestLab: positions/trades (no book).

close_expired_markets()
  → markets with close_at < now() AND status='open' → status='closed'
  → migration 045, pg_cron every minute

bulk_upsert_events(jsonb), bulk_upsert_markets(jsonb, boolean), bulk_upsert_outcomes(jsonb)
  → batch ON CONFLICT upserts used by sync-polymarket-markets
  → migrations 060/063/064/065
```

## Key triggers

| Trigger | Fires on | Effect |
|---|---|---|
| `markets_set_sort_volume` | BEFORE INSERT/UPDATE OF volume,event_id ON markets | denormalize events.volume → markets.sort_volume |
| `events_propagate_sort_volume` | AFTER UPDATE OF volume ON events | propagate to child markets |
| `markets_set_tag_slugs` | BEFORE INSERT/UPDATE OF event_id ON markets | denormalize events.tag_slugs → markets.tag_slugs (early-exit if event_id unchanged) |
| `events_propagate_tag_slugs` | AFTER UPDATE OF tag_slugs ON events | propagate to child markets |
| `auto_close_expired_markets` (cron) | every minute | flip `status='open' AND close_at < now()` → `closed` |

## Indexes (perf-critical)

```
idx_markets_visible_sort_volume  — (sort_volume DESC, created_at DESC, id DESC) WHERE is_visible
idx_markets_close_at_visible     — (close_at) WHERE is_visible AND close_at IS NOT NULL
idx_markets_tag_slugs_visible    — GIN (tag_slugs) WHERE is_visible            (migration 070)
idx_markets_event_visible_status — (event_id, is_visible, status)              (migration 048)
idx_events_tag_slugs             — GIN (tag_slugs)                             (migration 061)
idx_markets_status               — btree (status)
```

## RLS pattern

- Users: read own rows (filter by `auth.uid()`); writes via SECURITY DEFINER RPCs only.
- Managers: read rows of users in `manager_user_links`; writes through admin RPCs.
- Super admin: `is_super_admin()` helper — reads everything, gates admin-only RPCs.

## Cron jobs (pg_cron)

```
sync-hot-set-markets       */1 * * * *   POST /sync-polymarket-markets {mode:"hot_set"}
backfill-open-bets         30 * * * *    POST /sync-polymarket-markets {mode:"backfill"}
auto-close-expired-markets */1 * * * *   SELECT close_expired_markets()    (migration 045)
```

## Migrations notable

```
038  bets RLS + markets in realtime publication
043  market_outcomes in realtime publication
048  events table + event_id on markets
057  markets.sort_volume denormalization
060  bulk_upsert_* RPCs
061  events.tag_slugs (GIN)
065  bulk_upsert_events unions tag_slugs on conflict
066  partial close_at index for "closing today" filter
067  settle idempotent on bets
069  markets.tag_slugs denormalization + DROP markets/market_outcomes from realtime publication
070  backfill (in BEGIN/COMMIT + SET LOCAL statement_timeout=0) + GIN index for markets.tag_slugs
20260518  market_outcome_books + quote_bet_payout (order-book quotes)
20260601  odds→shares on bets (interim)
20260602  positions+trades model: place_bet/sell_position/settle on POSITIONS; bets frozen + backfill
20260603  admin_place_demo_bet + admin_bet_log on positions/trades (buy+sell+side)
```
