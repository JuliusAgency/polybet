-- Incident fix (2026-06-28) — Tier 1b: skip no-op writes in the bulk upsert RPCs.
--
-- Context: the market-tracker calls bulk_upsert_events/markets/outcomes for the
-- whole crawled universe every 5 min, always stamping last_synced_at = now().
-- The previous `INSERT ... ON CONFLICT DO UPDATE SET ...` (no WHERE) rewrote
-- EVERY row every cycle even when nothing changed -> ~2 TB WAL, full trigger
-- cascades (sort_volume / tag_slugs propagation), and the Realtime decode bill.
--
-- Fix: split each RPC into INSERT (new rows) + UPDATE (only genuinely-changed
-- existing rows). Unchanged rows become a PURE READ — no tuple rewrite, no row
-- lock, no WAL, no trigger fire. We deliberately use this split instead of
-- `ON CONFLICT DO UPDATE ... WHERE <changed>` because ON CONFLICT still takes an
-- exclusive tuple lock (and WAL-logs it) on every conflicting row even when the
-- WHERE skips the write — which would leave the lock-contention / deadlock and
-- per-row lock WAL in place.
--
-- Change detection excludes last_synced_at and source_updated_at (bookkeeping
-- timestamps): a row is rewritten only when a meaningful column actually
-- differs. Freshness for actively-traded markets is still maintained by the
-- WebSocket price path (flush_outcome_prices -> touchMarketsSynced), which is
-- unaffected.
--
-- Contract preserved exactly: each RPC still RETURNS the id-mapping for EVERY
-- input row (new + changed + unchanged), so the market-tracker's downstream
-- outcome-write and settlement steps keep working for unchanged markets. is_new
-- is true only for actually-inserted markets.
--
-- Idempotent (CREATE OR REPLACE) — safe to re-apply.

-- ─────────────────────────────────────────────────────────────────────────────
-- bulk_upsert_events
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_upsert_events(events jsonb, auto_show_all boolean)
 RETURNS TABLE(polymarket_id text, event_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return query
  with input as (
    select
      e->>'polymarket_id'                            as pid,
      nullif(e->>'slug', '')                         as slug,
      e->>'title'                                    as title,
      nullif(e->>'description', '')                  as description,
      nullif(e->>'category', '')                     as category,
      nullif(e->>'image_url', '')                    as image_url,
      coalesce(e->>'status', 'open')                 as status,
      nullif(e->>'close_at', '')::timestamptz        as close_at,
      nullif(e->>'last_synced_at', '')::timestamptz  as last_synced_at,
      nullif(e->>'tag_slug', '')                     as tag_slug,
      nullif(e->>'tag_label', '')                    as tag_label,
      coalesce(nullif(e->>'volume', '')::numeric, 0) as volume,
      nullif(e->>'game_start_time', '')::timestamptz as game_start_time,
      nullif(e->>'sport', '')                        as sport,
      case when jsonb_typeof(e->'teams') = 'array' then e->'teams' else null end as teams,
      case
        when jsonb_typeof(e->'tag_slugs') = 'array'
          then array(select jsonb_array_elements_text(e->'tag_slugs'))
        when nullif(e->>'tag_slug', '') is not null
          then array[nullif(e->>'tag_slug', '')]
        else '{}'::text[]
      end                                            as tag_slugs
    from jsonb_array_elements(events) e
    where e ? 'polymarket_id' and e ? 'title'
  ),
  joined as (
    select i.*, ev.id as existing_id
    from input i
    left join events ev on ev.polymarket_id = i.pid
  ),
  ins as (
    insert into events as ev (
      polymarket_id, slug, title, description, category, image_url,
      status, close_at, is_visible, last_synced_at,
      tag_slug, tag_label, tag_slugs, volume,
      game_start_time, sport, teams
    )
    select
      j.pid, j.slug, j.title, j.description, j.category, j.image_url,
      j.status, j.close_at, auto_show_all, j.last_synced_at,
      j.tag_slug, j.tag_label, j.tag_slugs, j.volume,
      j.game_start_time, j.sport, j.teams
    from joined j
    where j.existing_id is null
    on conflict (polymarket_id) do nothing
    returning ev.polymarket_id as polymarket_id, ev.id as event_id
  ),
  upd as (
    update events as ev
    set slug           = j.slug,
        title          = j.title,
        description    = j.description,
        category       = j.category,
        image_url      = j.image_url,
        is_visible     = ev.is_visible or auto_show_all,
        status         = case when ev.status in ('resolved', 'archived') then ev.status else j.status end,
        close_at       = j.close_at,
        last_synced_at = j.last_synced_at,
        tag_slug       = coalesce(j.tag_slug, ev.tag_slug),
        tag_label      = coalesce(j.tag_label, ev.tag_label),
        tag_slugs      = (
          case
            when array_length(j.tag_slugs, 1) is null then ev.tag_slugs
            else coalesce(
              (
                select array_agg(slug order by ord)
                from (
                  select slug, min(ord) as ord
                  from (
                    select unnest(ev.tag_slugs)        as slug,
                           generate_subscripts(ev.tag_slugs, 1) as ord
                    union all
                    select unnest(j.tag_slugs)         as slug,
                           coalesce(array_length(ev.tag_slugs, 1), 0)
                             + generate_subscripts(j.tag_slugs, 1) as ord
                  ) merged
                  group by slug
                ) deduped
              ),
              j.tag_slugs
            )
          end
        ),
        volume          = coalesce(j.volume, ev.volume),
        game_start_time = coalesce(j.game_start_time, ev.game_start_time),
        sport           = coalesce(j.sport, ev.sport),
        teams           = coalesce(j.teams, ev.teams)
    from joined j
    where ev.id = j.existing_id
      and (
            ( ev.status not in ('resolved', 'archived') and ev.status is distinct from j.status )
        or  ev.slug            is distinct from j.slug
        or  ev.title           is distinct from j.title
        or  ev.description     is distinct from j.description
        or  ev.category        is distinct from j.category
        or  ev.image_url       is distinct from j.image_url
        or  ev.close_at        is distinct from j.close_at
        or  ev.tag_slug        is distinct from coalesce(j.tag_slug, ev.tag_slug)
        or  ev.tag_label       is distinct from coalesce(j.tag_label, ev.tag_label)
        or  not (j.tag_slugs <@ ev.tag_slugs)
        or  ev.volume          is distinct from coalesce(j.volume, ev.volume)
        or  ev.game_start_time is distinct from coalesce(j.game_start_time, ev.game_start_time)
        or  ev.sport           is distinct from coalesce(j.sport, ev.sport)
        or  ev.teams           is distinct from coalesce(j.teams, ev.teams)
        or  (auto_show_all and not ev.is_visible)
      )
    returning ev.polymarket_id as polymarket_id, ev.id as event_id
  )
  select
    j.pid                                 as polymarket_id,
    coalesce(ins.event_id, j.existing_id) as event_id
  from joined j
  left join ins on ins.polymarket_id = j.pid
  where coalesce(ins.event_id, j.existing_id) is not null;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- bulk_upsert_markets
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_upsert_markets(markets jsonb, auto_show_all boolean)
 RETURNS TABLE(polymarket_id text, market_id uuid, is_new boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return query
  with input as (
    select
      m->>'polymarket_id'                              as pid,
      m->>'question'                                   as question,
      coalesce(m->>'status', 'open')                   as status,
      coalesce(nullif(m->>'volume', '')::numeric, 0)    as volume,
      coalesce(nullif(m->>'liquidity', '')::numeric, 0) as liquidity,
      nullif(m->>'image_url', '')                      as image_url,
      nullif(m->>'category', '')                       as category,
      nullif(m->>'close_at', '')::timestamptz          as close_at,
      nullif(m->>'polymarket_slug', '')                as polymarket_slug,
      nullif(m->>'event_id', '')::uuid                 as event_id,
      nullif(m->>'group_label', '')                    as group_label,
      nullif(m->>'last_synced_at', '')::timestamptz    as last_synced_at,
      nullif(m->>'source_updated_at', '')::timestamptz as source_updated_at,
      nullif(m->>'sports_market_type', '')             as sports_market_type,
      nullif(m->>'line', '')::numeric                  as line
    from jsonb_array_elements(markets) m
    where m ? 'polymarket_id' and m ? 'question'
  ),
  joined as (
    select i.*, mk.id as existing_id
    from input i
    left join markets mk on mk.polymarket_id = i.pid
  ),
  ins as (
    insert into markets as mk (
      polymarket_id, question, status, is_visible,
      volume, liquidity, image_url, category,
      close_at, polymarket_slug, event_id, group_label,
      last_synced_at, source_updated_at,
      sports_market_type, line
    )
    select
      j.pid, j.question, j.status, auto_show_all,
      j.volume, j.liquidity, j.image_url, j.category,
      j.close_at, j.polymarket_slug, j.event_id, j.group_label,
      j.last_synced_at, j.source_updated_at,
      j.sports_market_type, j.line
    from joined j
    where j.existing_id is null
    on conflict (polymarket_id) do nothing
    returning mk.polymarket_id as polymarket_id, mk.id as market_id
  ),
  upd as (
    update markets as mk
    set question           = j.question,
        status             = j.status,
        is_visible         = mk.is_visible or auto_show_all,
        volume             = j.volume,
        liquidity          = j.liquidity,
        image_url          = j.image_url,
        category           = j.category,
        close_at           = j.close_at,
        polymarket_slug    = j.polymarket_slug,
        event_id           = j.event_id,
        group_label        = j.group_label,
        last_synced_at     = j.last_synced_at,
        source_updated_at  = j.source_updated_at,
        sports_market_type = coalesce(j.sports_market_type, mk.sports_market_type),
        line               = coalesce(j.line, mk.line)
    from joined j
    where mk.id = j.existing_id
      and (
            mk.question           is distinct from j.question
        or  mk.status             is distinct from j.status
        or  mk.volume             is distinct from j.volume
        or  mk.liquidity          is distinct from j.liquidity
        or  mk.image_url          is distinct from j.image_url
        or  mk.category           is distinct from j.category
        or  mk.close_at           is distinct from j.close_at
        or  mk.polymarket_slug    is distinct from j.polymarket_slug
        or  mk.event_id           is distinct from j.event_id
        or  mk.group_label        is distinct from j.group_label
        or  mk.sports_market_type is distinct from coalesce(j.sports_market_type, mk.sports_market_type)
        or  mk.line               is distinct from coalesce(j.line, mk.line)
        or  (auto_show_all and not mk.is_visible)
      )
    returning mk.polymarket_id as polymarket_id, mk.id as market_id
  )
  select
    j.pid                                  as polymarket_id,
    coalesce(ins.market_id, j.existing_id) as market_id,
    (ins.market_id is not null)            as is_new
  from joined j
  left join ins on ins.polymarket_id = j.pid
  where coalesce(ins.market_id, j.existing_id) is not null;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- bulk_upsert_outcomes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_upsert_outcomes(outcomes jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected int;
begin
  with input as (
    select
      (o->>'market_id')::uuid                       as market_id,
      o->>'polymarket_token_id'                     as token_id,
      o->>'name'                                    as name,
      coalesce((o->>'price')::numeric, 0)           as price,
      coalesce((o->>'odds')::numeric, 1)            as odds,
      coalesce((o->>'effective_odds')::numeric, 1)  as effective_odds,
      (o->>'updated_at')::timestamptz               as updated_at
    from jsonb_array_elements(outcomes) o
    where o ? 'market_id' and o ? 'polymarket_token_id' and o ? 'name'
  ),
  joined as (
    select i.*, mo.id as existing_id
    from input i
    left join market_outcomes mo
      on mo.market_id = i.market_id and mo.polymarket_token_id = i.token_id
  ),
  ins as (
    insert into market_outcomes as mo (
      market_id, polymarket_token_id, name, price, odds, effective_odds, updated_at
    )
    select j.market_id, j.token_id, j.name, j.price, j.odds, j.effective_odds, j.updated_at
    from joined j
    where j.existing_id is null
    on conflict (market_id, polymarket_token_id) do nothing
    returning 1
  ),
  upd as (
    update market_outcomes as mo
    set name           = j.name,
        price          = j.price,
        odds           = j.odds,
        effective_odds = j.effective_odds,
        updated_at     = j.updated_at
    from joined j
    where mo.id = j.existing_id
      and (
            mo.name           is distinct from j.name
        or  mo.price          is distinct from j.price
        or  mo.odds           is distinct from j.odds
        or  mo.effective_odds is distinct from j.effective_odds
      )
    returning 1
  )
  select (select count(*) from ins) + (select count(*) from upd) into affected;

  return affected;
end;
$function$;
