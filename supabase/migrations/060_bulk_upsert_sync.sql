-- Migration 060: bulk_upsert_events / bulk_upsert_markets / bulk_upsert_outcomes.
--
-- Replaces the per-row SELECT + INSERT/UPDATE pattern in
-- services/market-tracker/src/db/batchWriter.ts (upsertEventFromGamma,
-- upsertMarketFromGamma and the market_outcomes upsert that followed it).
--
-- The old path fired roughly (2 + 3*N) roundtrips per Gamma event — on a
-- whitelist of ~1-2k events with ~2-4 markets each that was 8-16k sequential
-- Supabase calls per eventCrawl. That's where both the peak memory (pending
-- fetch/undici/pino buffers) and the long-tail latency came from.
--
-- These three RPCs accept a single JSONB array per table and do the whole
-- batch server-side in one round-trip each. The caller gets back:
--   - bulk_upsert_events → (polymarket_id, event_id) mapping so it can fill
--     markets.event_id before calling the next RPC.
--   - bulk_upsert_markets → (polymarket_id, market_id, is_new) so the caller
--     knows which markets need WebSocket subscription.
--   - bulk_upsert_outcomes → count of affected rows.
--
-- Semantics preserved from the TypeScript path:
--   - is_visible is NEVER overwritten on update (auto_show_all only applies
--     to brand-new rows). This is why we can't use the default
--     "INSERT ... ON CONFLICT DO UPDATE SET ..." macro and have to pick
--     which columns the UPDATE touches.
--   - tag_slug/tag_label on events are preserved if the input carries NULL
--     (the previous `if (tag && tag.slug)` branch in upsertEventFromGamma).
--   - volume on events falls back to the existing value when the input is
--     NULL (mirrors `if (volume != null) updatePayload.volume = volume`).
--   - is_new for markets is derived from `xmax = 0`, which is Postgres's
--     well-known "was this row inserted in the current command, not
--     updated?" trick. Works because ON CONFLICT DO UPDATE sets xmax to the
--     txid of the superseded tuple, while a pure INSERT leaves it at 0.
--
-- Security: service_role only — matches migration 058's policy.

-- ────────────────────────────────────────────────────────────────
-- 1. bulk_upsert_events
-- ────────────────────────────────────────────────────────────────
create or replace function bulk_upsert_events(
  events jsonb,
  auto_show_all boolean
)
returns table(polymarket_id text, event_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with input as (
    select
      e->>'polymarket_id'                    as pid,
      nullif(e->>'slug', '')                 as slug,
      e->>'title'                            as title,
      nullif(e->>'description', '')          as description,
      nullif(e->>'category', '')             as category,
      nullif(e->>'image_url', '')            as image_url,
      coalesce(e->>'status', 'open')         as status,
      nullif(e->>'close_at', '')::timestamptz as close_at,
      nullif(e->>'last_synced_at', '')::timestamptz as last_synced_at,
      nullif(e->>'tag_slug', '')             as tag_slug,
      nullif(e->>'tag_label', '')            as tag_label,
      nullif(e->>'volume', '')::numeric      as volume
    from jsonb_array_elements(events) e
    where e ? 'polymarket_id' and e ? 'title'
  ),
  upserted as (
    insert into events as ev (
      polymarket_id, slug, title, description, category, image_url,
      status, close_at, is_visible, last_synced_at,
      tag_slug, tag_label, volume
    )
    select
      i.pid, i.slug, i.title, i.description, i.category, i.image_url,
      i.status, i.close_at, auto_show_all, i.last_synced_at,
      i.tag_slug, i.tag_label, coalesce(i.volume, 0)
    from input i
    on conflict (polymarket_id) do update
      set slug           = excluded.slug,
          title          = excluded.title,
          description    = excluded.description,
          category       = excluded.category,
          image_url      = excluded.image_url,
          status         = excluded.status,
          close_at       = excluded.close_at,
          last_synced_at = excluded.last_synced_at,
          tag_slug       = coalesce(excluded.tag_slug, ev.tag_slug),
          tag_label      = coalesce(excluded.tag_label, ev.tag_label),
          volume         = coalesce(excluded.volume, ev.volume)
    returning ev.polymarket_id, ev.id
  )
  select u.polymarket_id, u.id from upserted u;
end;
$$;

revoke all on function bulk_upsert_events(jsonb, boolean) from public;
revoke all on function bulk_upsert_events(jsonb, boolean) from anon;
revoke all on function bulk_upsert_events(jsonb, boolean) from authenticated;
grant execute on function bulk_upsert_events(jsonb, boolean) to service_role;

-- ────────────────────────────────────────────────────────────────
-- 2. bulk_upsert_markets
-- ────────────────────────────────────────────────────────────────
create or replace function bulk_upsert_markets(
  markets jsonb,
  auto_show_all boolean
)
returns table(polymarket_id text, market_id uuid, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with input as (
    select
      m->>'polymarket_id'                        as pid,
      m->>'question'                             as question,
      coalesce(m->>'status', 'open')             as status,
      nullif(m->>'volume', '')::numeric          as volume,
      nullif(m->>'liquidity', '')::numeric       as liquidity,
      nullif(m->>'image_url', '')                as image_url,
      nullif(m->>'category', '')                 as category,
      nullif(m->>'close_at', '')::timestamptz    as close_at,
      nullif(m->>'polymarket_slug', '')          as polymarket_slug,
      nullif(m->>'event_id', '')::uuid           as event_id,
      nullif(m->>'group_label', '')              as group_label,
      nullif(m->>'last_synced_at', '')::timestamptz    as last_synced_at,
      nullif(m->>'source_updated_at', '')::timestamptz as source_updated_at
    from jsonb_array_elements(markets) m
    where m ? 'polymarket_id' and m ? 'question'
  ),
  upserted as (
    insert into markets as mk (
      polymarket_id, question, status, is_visible,
      volume, liquidity, image_url, category,
      close_at, polymarket_slug, event_id, group_label,
      last_synced_at, source_updated_at
    )
    select
      i.pid, i.question, i.status, auto_show_all,
      coalesce(i.volume, 0), coalesce(i.liquidity, 0), i.image_url, i.category,
      i.close_at, i.polymarket_slug, i.event_id, i.group_label,
      i.last_synced_at, i.source_updated_at
    from input i
    on conflict (polymarket_id) do update
      set question          = excluded.question,
          status            = excluded.status,
          volume            = excluded.volume,
          liquidity         = excluded.liquidity,
          image_url         = excluded.image_url,
          category          = excluded.category,
          close_at          = excluded.close_at,
          polymarket_slug   = excluded.polymarket_slug,
          event_id          = excluded.event_id,
          group_label       = excluded.group_label,
          last_synced_at    = excluded.last_synced_at,
          source_updated_at = excluded.source_updated_at
    returning mk.polymarket_id, mk.id, (xmax = 0) as is_new
  )
  select u.polymarket_id, u.market_id, u.is_new from upserted u;
end;
$$;

revoke all on function bulk_upsert_markets(jsonb, boolean) from public;
revoke all on function bulk_upsert_markets(jsonb, boolean) from anon;
revoke all on function bulk_upsert_markets(jsonb, boolean) from authenticated;
grant execute on function bulk_upsert_markets(jsonb, boolean) to service_role;

-- ────────────────────────────────────────────────────────────────
-- 3. bulk_upsert_outcomes
-- ────────────────────────────────────────────────────────────────
create or replace function bulk_upsert_outcomes(outcomes jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int;
begin
  with input as (
    select
      (o->>'market_id')::uuid                  as market_id,
      o->>'polymarket_token_id'                as token_id,
      o->>'name'                               as name,
      coalesce((o->>'price')::numeric, 0)      as price,
      coalesce((o->>'odds')::numeric, 1)       as odds,
      coalesce((o->>'effective_odds')::numeric, 1) as effective_odds,
      (o->>'updated_at')::timestamptz          as updated_at
    from jsonb_array_elements(outcomes) o
    where o ? 'market_id' and o ? 'polymarket_token_id' and o ? 'name'
  ),
  upserted as (
    insert into market_outcomes as mo (
      market_id, polymarket_token_id, name, price, odds, effective_odds, updated_at
    )
    select i.market_id, i.token_id, i.name, i.price, i.odds, i.effective_odds, i.updated_at
    from input i
    on conflict (market_id, polymarket_token_id) do update
      set name           = excluded.name,
          price          = excluded.price,
          odds           = excluded.odds,
          effective_odds = excluded.effective_odds,
          updated_at     = excluded.updated_at
    returning 1
  )
  select count(*) into affected from upserted;

  return affected;
end;
$$;

revoke all on function bulk_upsert_outcomes(jsonb) from public;
revoke all on function bulk_upsert_outcomes(jsonb) from anon;
revoke all on function bulk_upsert_outcomes(jsonb) from authenticated;
grant execute on function bulk_upsert_outcomes(jsonb) to service_role;
