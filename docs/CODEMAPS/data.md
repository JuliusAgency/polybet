<!-- Generated: 2026-06-23 | Tables scanned: ~18 public + ~146 migrations + 4 seeds | Token estimate: ~950 -->

# Data

Postgres 17 (Supabase managed). All `public.*` tables RLS-enabled. Trading model = positions+trades exchange (2026-06-02); `bets` FROZEN. ~146 migrations: numeric `001`–`075` (legacy, applied) + `20260504`…`20260622` timestamped.

## Schema

```
profiles (id PK = auth.users.id, role: user|manager|super_admin, is_active, blocked,
   │      first_name, last_name)                              -- first/last cols: 20260524100940
   ├──► managers              (id PK = profiles.id, agent_code, balance, settings)
   │      └─► manager_user_links  (manager_id ↔ user_id)
   ├──► balances              (user_id PK, available, in_play)
   │                           INVARIANT: in_play == Σ cost_basis of OPEN positions
   │                           CHECK available>=0, in_play>=0 (NOT VALID→validated 20260610)
   ├──► positions             (id, user_id, market_id, outcome_id, shares, avg_price∈(0,1),
   │     │                      cost_basis=shares*avg_price, realized_pnl,
   │     │                      status: open|closed|won|lost, UNIQUE(user_id,outcome_id))
   │     │                      MUTABLE aggregate. idx_positions_market_open (market_id WHERE open)
   │     └─► trades           (id, position_id, side: buy|sell, shares, price∈(0,1),
   │                            usd, realized_pnl, created_at) IMMUTABLE fill ledger
   ├──► bets                  FROZEN/historical — never written; backfilled→positions/trades
   └──► balance_transactions  (id, user_id, type: mint|transfer|bet_lock|bet_payout|
                               adjustment|bet_sell, amount, balance_after,
                               bet_id?|trade_id?|position_id?, note, created_at)
                               3 partial-unique idx: trade_lock, trade_sell, position_payout

events  (id, polymarket_id, title, category, image_url, close_at, status, volume,
   │     tag_slug, tag_label, tag_slugs[], trending_rank, volume_24hr, is_visible,
   │     last_synced_at, slug?,  sport jsonb/teams, game_start_time)   -- WC sports: 20260616
   └──► markets  (id, polymarket_id, question, status: open|closed|resolved|archived,
          │       winning_outcome_id?, is_visible, last_synced_at, volume, event_id?,
          │       polymarket_slug, sports_market_type, line,
          │       DENORM: sort_volume, tag_slugs[], trending_rank, volume_24hr,
          │       event_is_visible)
          ├──► market_outcomes  (id, market_id, name, price, odds, effective_odds,
          │                      polymarket_token_id, position int)  -- position: 20260510
          └──► user_favorite_markets  (user_id ↔ market_id)

user_favorite_events       (user_id ↔ event_id)  -- cascade-deletes child market favs
market_outcome_books       (polymarket_token_id PK, outcome_id, asks numeric[], bids numeric[],
                            hash, updated_at)  CLOB cache. updated_at stamped by DB clock trigger
                            trg_market_outcome_books_touch (20260609131610)
market_settlement_logs / position_settlement_logs  (settlement audit)
bet_settlement_logs        FROZEN (legacy per-bet; superseded by position_settlement_logs)
system_settings    (key PK, value jsonb): market_volume_threshold_usd (200k, was 500k →20260618),
                    allowed_category_tags (Trump removed 20260621), category_subtags (20260621),
                    tracker_heartbeat
admin_action_logs / sync_runs / market_data_deltas (audit/ops, not user-facing)
```

## Denormalized columns on `markets` (trigger-maintained — never write from app)

| Column | Mirror of | Migration | Index |
|---|---|---|---|
| `sort_volume` | events.volume (fallback markets.volume, 0) | 057 | idx_markets_servable_sort_volume |
| `tag_slugs[]` | events.tag_slugs[] | 069 | idx_markets_tag_slugs_visible (GIN partial) |
| `trending_rank`,`volume_24hr` | events trending feed | 075 | idx_markets_trending_servable |
| `event_is_visible` | events.is_visible | 20260618 | (used in RLS to kill correlated subquery) |

Servable indexes (`WHERE is_visible AND event_is_visible`) added 20260618; old `is_visible`-only versions kept (pending drop).

## RLS summary

```
profiles, balances, positions, trades, position_settlement_logs, bets, balance_transactions
                  read: self | linked manager | super_admin
positions/trades/settlement-logs  writes: SECURITY DEFINER RPC only (REVOKE from anon/authenticated)
managers          read: self | super_admin                            writes via RPC
markets/market_outcomes/events  read: is_visible AND auth.uid() NOT NULL (event_is_visible local col)
user_favorite_markets / user_favorite_events  read/write: self
admin_action_logs / sync_runs / market_settlement_logs  read: super_admin
system_settings   read: super_admin EXCEPT key='category_subtags' (public read, 20260621102219)
```
Security audit 20260610: REVOKE settle/lifecycle/report RPCs from public/anon/authenticated → service_role only; blanket `SET search_path=public` on SECURITY DEFINER fns; view `security_invoker` on system_kpis + manager_group_metrics. CLI 2.106 parity grant 20260611165806 (blanket GRANT + ALTER DEFAULT PRIVILEGES, then re-REVOKE positions/trades/settlement logs).

## Realtime publication (`supabase_realtime`)

Published: `bets`, `balances`, `balance_transactions`, `profiles`. **`events` dropped 20260617** (no subscribers, WAL decode caused statement timeouts). `markets`/`market_outcomes` dropped 069. `positions`/`trades` NOT published — settlement learned via `balance_transactions` INSERT (`bet_payout`) → `useBetResultNotifications`.

## RPCs (SECURITY DEFINER, SET search_path)

```
place_bet(market,outcome,stake,expected_odds)  BUY: upsert positions weighted-avg + buy trade.
   Guards: is_active, max-bet-limit, status=open AND is_visible, 3min mkt staleness,
   quote_bet_payout (walk asks[]), 30s book staleness, partial-reject, 2% drift (P0002)
sell_position(position_id,shares,expected_price)  SELL: quote_sell_proceeds (walk bids[]),
   release cost_basis, float64 clamp (20260611), 30s book staleness, 2% drift (P0002)
settle_market(market,winner) / settle_market_by_token(token)  service_role only; processes
   open POSITIONS; writes position_settlement_logs. settle_pending_bets / list_stranded_*
quote_bet_payout / quote_sell_proceeds  STABLE, walk flat numeric[] [p0,s0,p1,s1,...]
bulk_upsert_events/markets/outcomes  service_role; is_visible promotion + status stickiness
get_sync_health()  super_admin; books_stale_seconds, tracker_heartbeat_at, ws_connected,
   subscribed_tokens, pending_settlements (extended 20260617/0621/0622)
admin_adjust_balance / admin_get_report_dataset / set_events_trending_rankings / subtags_with_markets
```
`close_expired_markets()` DROPPED in final migration **20260622165744** — closure is Polymarket-authority only (status flags), not time-based.

## Migration timeline (highlights)

```
001 baseline · 048 events+event_id · 057 sort_volume · 069 tag_slugs denorm + drop mkts realtime
075 trending_rank/volume_24hr
20260510 market_outcomes.position · 20260518 market_outcome_books + quote_bet_payout
20260524 profiles first/last_name · 20260525 quote_bet available_stake + my_bet_limit RPC
20260601 odds→shares interim · 20260602 positions+trades (8 mig): tables, place_bet/sell_position/
   settle_market on positions, bets frozen+backfill, balance_transactions += bet_sell + uniq idx
20260603 admin_place_demo_bet→positions, admin_bet_log side col, book staleness 5s→30s
20260609 book_updated_at DB-clock trigger · 20260610 security audit (revoke grants, search_path,
   CHECK balances>=0, settlement-log manager RLS via links) · 20260611 float64 clamp + CLI parity
20260616 WC sports cols (events.teams/sport/game_start_time, markets.sports_market_type/line)
20260617 drop events from realtime · 20260618 event_is_visible denorm + servable idx; threshold 200k
20260621 category_subtags (public-read RLS) + subtags_with_markets; Trump removed from allowed tags
20260622 get_sync_health extended; DROP close_expired_markets (LAST)
```

## Seeds (`supabase/seed/`)

```
001_super_admin.sql       super_admin profile + auth.users
002_test_users.sql        admin/manager/user1-3 + profiles(first/last_name) + managers + balances +
                          manager_user_links (mirrors e2e/fixtures/users.ts)
003_betting_history.sql   admin_action_logs + 1 sync_runs row only — NO positions/trades/books
004_markets_snapshot.sql  empty by default; populate via `npm run snapshot:refresh`
```
Gap (known, per CLAUDE.md): no seeded positions/trades/market_outcome_books → sell-flow E2E needs factories or snapshot. When a migration tightens schema, audit + update seeds in the same change.
