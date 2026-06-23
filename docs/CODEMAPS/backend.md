<!-- Generated: 2026-06-23 | ~146 migrations + 8 edge fns + 9 RPCs scanned | Token estimate: ~950 -->

# Backend

Supabase Postgres + Edge Functions (Deno) + market-tracker (Heroku). All edge functions run `verify_jwt = false`; each validates the bearer in-function (see CLAUDE.md "Edge Functions JWT Policy"). Trading model = `positions` + `trades` exchange (`bets` FROZEN, never written/read by app code).

## Edge Functions (all verify_jwt=false; in-function auth via `_shared/edgeAuth.authorizeEdgeCall`)

| Function | Purpose | Auth tier | Triggered by |
|---|---|---|---|
| `create-user` | Create manager (super_admin) or end user (manager/super_admin) + balance; manual compensating rollback (no txn) | role: super_admin/manager | admin UI |
| `export-admin-report` | PDF reports; re-uses **caller JWT** (not adminClient) so `auth.uid()` resolves in `admin_get_report_dataset` | role: super_admin | admin UI |
| `market-price-history` | CLOB /prices-history proxy; per-isolate 30s cache + in-flight dedup (NOT cross-isolate) | any authenticated | bet/event charts |
| `refresh-markets` | Batched Gamma pull ≤20 ids; updates market_outcomes; settles resolved inline via `settle_market` | role: user/manager/super_admin | `useMarketRefresh` 30s |
| `quote-bet` | Walks CLOB **asks** for stake; upserts market_outcome_books | role: user/manager/super_admin | `useBetQuote` (Buy) |
| `quote-sell` | Walks CLOB **bids** for shares; upserts market_outcome_books | role: user/manager/super_admin | `useSellQuote` (Sell) |
| `settle-markets` | Settle one market via `settle_market`, optional Gamma winner auto-resolve | **service-role ONLY** (super_admin JWT 403'd) | cron / manual |
| `sync-polymarket-markets` | 5 modes: full/hot_set/active_page/backfill/resolved_only; trending; anti-pile-up guard | service-role OR super_admin | cron |
| `_shared/` | edgeAuth, edgeAuthRules (pure), cors (PROD locks vercel origin), gammaFetch/gammaUrls (dual closed=false/true), marketLifecycle, polymarketWinner | — | imported |

Client: `invokeAuthedFunction.ts` (v0.3.13, commit 9e51938) — 60s expiry-skew token pre-refresh + single 401-retry-with-force-refresh for backgrounded-tab expiry. `invokeSupabaseFunction.ts` binds the singleton client.

## Critical RPCs (SECURITY DEFINER, `SET search_path = public`)

```
place_bet(market_id, outcome_id, stake, expected_odds)         BUY
  is_active gate → resolve_effective_max_bet_limit → markets FOR UPDATE (status=open AND is_visible)
  → quote_bet_payout(asks) → book staleness ≤30s → partial-reject → drift 2% (P0002)
  → upsert positions (weighted-avg avg_price) + INSERT trades(buy) + balances(available-=, in_play+=)
  + balance_transactions(bet_lock, trade_id, position_id). Returns position id.
sell_position(position_id, shares, expected_price)             SELL (partial/full)
  is_active → positions FOR UPDATE → float64 overshoot clamp (1e-9) → quote_sell_proceeds(bids)
  → ≤30s book → partial-reject → drift 2% (P0002) → release cost_basis, available+=proceeds,
  realized_pnl += proceeds - sold*avg_price (avg_price UNCHANGED) + trades(sell) + bt(bet_sell). Returns jsonb.
quote_bet_payout(token_id, stake) / quote_sell_proceeds(token_id, shares)
  STABLE; walk market_outcome_books.asks[]/.bids[] flat numeric[] [p0,s0,p1,s1,...]. Returns slippage quote.
settle_market(m_id, winning_outcome_id) / settle_market_by_token(...)  service-role only
  open positions: winner available+=shares*$1, loser 0, both release cost_basis from in_play
  + market_settlement_logs + position_settlement_logs. Idempotent (bt ON CONFLICT DO NOTHING).
bulk_upsert_events/markets/outcomes(jsonb)  service-role; is_visible promotion + status stickiness (resolved/archived terminal); fire denorm propagation triggers.
get_sync_health()  super_admin (in-body is_super_admin gate); books_stale_seconds, tracker_heartbeat_at, ws_connected, subscribed_tokens, pending_settlements.
admin_adjust_balance / admin_get_report_dataset / set_events_trending_rankings(svc) / subtags_with_markets(svc) / settle_pending_bets / admin_place_demo_bet (TestLab).
```
NOTE: `close_expired_markets()` was **DROPPED** (mig 20260622165744) — time-based closure violated Polymarket authority. Closure is now Polymarket-driven only (lifecycleCrawl + resolutionScan + WS market_resolved).

## Key triggers
| Trigger | Fires | Effect |
|---|---|---|
| markets_set_sort_volume / events_propagate_sort_volume | markets BEFORE I/U vol,event_id / events AFTER U vol | events.volume → markets.sort_volume |
| markets_set_tag_slugs / events_propagate_tag_slugs | markets BEFORE I/U event_id (early-exit) / events AFTER U tag_slugs | events.tag_slugs → markets.tag_slugs |
| markets_set_event_is_visible / events_propagate_is_visible | mig 20260618 | events.is_visible → markets.event_is_visible (kills correlated RLS subquery) |
| trg_events_propagate_trending_fields | mig 075 | events.trending_rank,volume_24hr → markets |
| market_outcomes_set_position | mig 20260510 | name → 0=Yes/1=No |
| trg_market_outcome_books_touch | mig 20260609 | overwrite updated_at = pg now() (kills cross-runtime clock skew in staleness guards) |

## Perf indexes
```
idx_markets_servable_sort_volume   (sort_volume DESC, created_at DESC, id DESC) WHERE is_visible AND event_is_visible
idx_markets_trending_servable      (trending_rank, sort_volume DESC, id DESC)   WHERE is_visible AND event_is_visible
idx_markets_tag_slugs_visible      GIN(tag_slugs) WHERE is_visible              (feed tag filter)
idx_market_outcomes_market_position / market_outcome_books_updated_at_idx
uq_balance_transactions_{trade_lock,trade_sell,position_payout}  partial-unique idempotency keys
(legacy is_visible-only idx_markets_visible_sort_volume / _trending_sort_volume_visible still present — drop pending)
```

## RLS pattern
- Users: read own rows by `auth.uid()`; all writes via SECURITY DEFINER RPCs (anon/authenticated REVOKE'd on positions/trades/settlement logs).
- Managers: read linked users via `manager_user_links`; stronger policies add `AND role='manager'` (older bets/bt policies lack the role check — latent IDOR if a non-manager id appears in links).
- Super admin: `is_super_admin()` helper.
- Public read exception: `system_settings WHERE key='category_subtags'` only (mig 20260621102219).
- CLI ≥2.106 parity: blanket GRANT + ALTER DEFAULT PRIVILEGES (mig 20260611165806) then deliberate REVOKEs — every new RPC-only table must be manually REVOKE'd.

## Realtime publication (per-user filtered only)
`bets, balances, balance_transactions, profiles`. **NOT** markets/market_outcomes (dropped mig 069) or events (dropped mig 20260617). positions/trades are polled, not published. Settlement signal = `balance_transactions` INSERT (bet_payout).

## Cron / runtimes
- pg_cron: `sync-polymarket-markets` (hot_set ~1m + skip-guard; backfill hourly).
- **market-tracker (Heroku, 24/7)** is the canonical pipeline: persistent CLOB WS (price+book sub-second) + Gamma tasks (eventCrawl 5m, lifecycleCrawl 10m, resolutionScan 2m, settlePendingBets 1m, syncTrendingRankings 5m, refreshCategorySubtags 1h, archiver 30m). Writes via service-role. Heartbeat → system_settings every 10s.

## Notable migrations
```
001 baseline   057 sort_volume   069 tag_slugs + DROP markets/mkt_outcomes realtime   075 trending_rank
20260510 mkt_outcomes.position   20260518 market_outcome_books + quote_bet_payout   20260524 first/last_name
20260525 quote_bet available_stake (asks walk)
20260602xxxxxx (8) positions+trades model: tables, place_bet, quote_sell+sell_position, settle on positions,
              bt trade_id/position_id + 'bet_sell' + idempotency idx, bets backfill→positions/trades (FROZEN)
20260603 book staleness 5s→30s   20260609 book updated_at=pg clock
20260610 security audit: REVOKE settle/lifecycle from anon/auth; SET search_path sweep; balances CHECK >=0; view security_invoker
20260611 sell_position float64 clamp + is_active; CLI grant parity
20260616 World Cup sports cols (events.teams/sport/game_start_time, markets.sports_market_type/line)
20260617 DROP events from realtime   20260618 event_is_visible denorm + servable indexes; threshold 500k→200k
20260621 category_subtags public-read RLS + subtags_with_markets   20260622 DROP close_expired_markets (last)
```
