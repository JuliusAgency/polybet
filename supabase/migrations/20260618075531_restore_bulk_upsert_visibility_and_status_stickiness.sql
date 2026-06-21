-- Restore two behaviours that migration 20260616143809 (world_cup_games_metadata)
-- accidentally reverted.
--
-- 20260616143809 rewrote bulk_upsert_events / bulk_upsert_markets as a "faithful
-- copy of migration 064/065, extended" to add the World Cup columns
-- (game_start_time/sport/teams on events, sports_market_type/line on markets).
-- But 064/065 predate two later fixes, so copying from that base silently
-- dropped them from the ON CONFLICT clauses:
--
--   1. is_visible promotion (migration 20260527093751):
--        is_visible = <current> OR auto_show_all
--      Without it, an event/market first synced while sync_auto_show_all was OFF
--      stays hidden forever even after the flag flips ON. Its child markets are
--      inserted is_visible=true but RLS hides them (parent hidden) -> they become
--      "stranded visible-under-hidden-parent" rows. This is the upstream driver
--      of the Trending-feed statement-timeout fixed in 20260618074742: those
--      stranded rows pile up at the top of the popularity order and the feed walk
--      must skip past all of them. Restoring promotion stops the accumulation and
--      makes the World Cup events visible to users again.
--
--   2. status stickiness (migrations 072/073):
--        status = CASE WHEN current IN ('resolved','archived') THEN current
--                      ELSE incoming END
--      Without it, the minute/5-min sync can pull an already resolved/archived
--      event back to 'closed' because Polymarket leaves event.resolved=null on
--      decided events.
--
-- This migration re-applies both, on top of the current (20260616143809) bodies
-- so the World Cup columns are preserved. Regression coverage:
-- tests-db/triggers/bulk_upsert_visibility.test.ts.

-- ──────────────────────────────────────────────────────────────────────────
-- bulk_upsert_events — current body + restored is_visible promotion + status
-- stickiness.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function bulk_upsert_events(
  events jsonb,
  auto_show_all boolean
)
returns table(polymarket_id text, event_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
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
      nullif(e->>'volume', '')::numeric      as volume,
      nullif(e->>'game_start_time', '')::timestamptz as game_start_time,
      nullif(e->>'sport', '')                as sport,
      case
        when jsonb_typeof(e->'teams') = 'array' then e->'teams'
        else null
      end                                    as teams,
      case
        when jsonb_typeof(e->'tag_slugs') = 'array'
          then array(
                 select jsonb_array_elements_text(e->'tag_slugs')
               )
        when nullif(e->>'tag_slug', '') is not null
          then array[nullif(e->>'tag_slug', '')]
        else '{}'::text[]
      end                                    as tag_slugs
    from jsonb_array_elements(events) e
    where e ? 'polymarket_id' and e ? 'title'
  ),
  upserted as (
    insert into events as ev (
      polymarket_id, slug, title, description, category, image_url,
      status, close_at, is_visible, last_synced_at,
      tag_slug, tag_label, tag_slugs, volume,
      game_start_time, sport, teams
    )
    select
      i.pid, i.slug, i.title, i.description, i.category, i.image_url,
      i.status, i.close_at, auto_show_all, i.last_synced_at,
      i.tag_slug, i.tag_label, i.tag_slugs, coalesce(i.volume, 0),
      i.game_start_time, i.sport, i.teams
    from input i
    on conflict (polymarket_id) do update
      set slug           = excluded.slug,
          title          = excluded.title,
          description    = excluded.description,
          category       = excluded.category,
          image_url      = excluded.image_url,
          -- Restored (migration 20260527093751): promote hidden -> visible when
          -- auto-show is on; never downgrade. No-op when auto_show_all is false.
          is_visible     = ev.is_visible or auto_show_all,
          -- Restored (migrations 072/073): terminal states are sticky so the
          -- sync cannot pull a resolved/archived event back to 'closed'.
          status         = case
                             when ev.status in ('resolved', 'archived') then ev.status
                             else excluded.status
                           end,
          close_at       = excluded.close_at,
          last_synced_at = excluded.last_synced_at,
          tag_slug       = coalesce(excluded.tag_slug, ev.tag_slug),
          tag_label      = coalesce(excluded.tag_label, ev.tag_label),
          tag_slugs      = (
            case
              when array_length(excluded.tag_slugs, 1) is null then ev.tag_slugs
              else coalesce(
                (
                  select array_agg(slug order by ord)
                  from (
                    select slug, min(ord) as ord
                    from (
                      select unnest(ev.tag_slugs)        as slug,
                             generate_subscripts(ev.tag_slugs, 1) as ord
                      union all
                      select unnest(excluded.tag_slugs)  as slug,
                             coalesce(array_length(ev.tag_slugs, 1), 0)
                               + generate_subscripts(excluded.tag_slugs, 1) as ord
                    ) merged
                    group by slug
                  ) deduped
                ),
                excluded.tag_slugs
              )
            end
          ),
          volume          = coalesce(excluded.volume, ev.volume),
          game_start_time = coalesce(excluded.game_start_time, ev.game_start_time),
          sport           = coalesce(excluded.sport, ev.sport),
          teams           = coalesce(excluded.teams, ev.teams)
    returning ev.polymarket_id, ev.id
  )
  select u.polymarket_id, u.id from upserted u;
end;
$$;

revoke all on function bulk_upsert_events(jsonb, boolean) from public;
revoke all on function bulk_upsert_events(jsonb, boolean) from anon;
revoke all on function bulk_upsert_events(jsonb, boolean) from authenticated;
grant execute on function bulk_upsert_events(jsonb, boolean) to service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- bulk_upsert_markets — current body + restored is_visible promotion. (Markets
-- have no terminal-state stickiness by design; only is_visible is restored.)
-- ──────────────────────────────────────────────────────────────────────────
create or replace function bulk_upsert_markets(
  markets jsonb,
  auto_show_all boolean
)
returns table(polymarket_id text, market_id uuid, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
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
      nullif(m->>'source_updated_at', '')::timestamptz as source_updated_at,
      nullif(m->>'sports_market_type', '')       as sports_market_type,
      nullif(m->>'line', '')::numeric            as line
    from jsonb_array_elements(markets) m
    where m ? 'polymarket_id' and m ? 'question'
  ),
  upserted as (
    insert into markets as mk (
      polymarket_id, question, status, is_visible,
      volume, liquidity, image_url, category,
      close_at, polymarket_slug, event_id, group_label,
      last_synced_at, source_updated_at,
      sports_market_type, line
    )
    select
      i.pid, i.question, i.status, auto_show_all,
      coalesce(i.volume, 0), coalesce(i.liquidity, 0), i.image_url, i.category,
      i.close_at, i.polymarket_slug, i.event_id, i.group_label,
      i.last_synced_at, i.source_updated_at,
      i.sports_market_type, i.line
    from input i
    on conflict (polymarket_id) do update
      set question          = excluded.question,
          status            = excluded.status,
          -- Restored (migration 20260527093751): promote hidden -> visible when
          -- auto-show is on; never downgrade. No-op when auto_show_all is false.
          is_visible        = mk.is_visible or auto_show_all,
          volume            = excluded.volume,
          liquidity         = excluded.liquidity,
          image_url         = excluded.image_url,
          category          = excluded.category,
          close_at          = excluded.close_at,
          polymarket_slug   = excluded.polymarket_slug,
          event_id          = excluded.event_id,
          group_label       = excluded.group_label,
          last_synced_at    = excluded.last_synced_at,
          source_updated_at = excluded.source_updated_at,
          sports_market_type = coalesce(excluded.sports_market_type, mk.sports_market_type),
          line              = coalesce(excluded.line, mk.line)
    returning mk.polymarket_id as polymarket_id,
              mk.id            as market_id,
              (xmax = 0)       as is_new
  )
  select u.polymarket_id, u.market_id, u.is_new from upserted u;
end;
$$;

revoke all on function bulk_upsert_markets(jsonb, boolean) from public;
revoke all on function bulk_upsert_markets(jsonb, boolean) from anon;
revoke all on function bulk_upsert_markets(jsonb, boolean) from authenticated;
grant execute on function bulk_upsert_markets(jsonb, boolean) to service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- One-time backfill of rows stranded hidden since 20260616143809 (idempotent;
-- re-running on a clean DB matches nothing). Identical intent to migration
-- 20260527093751. The events UPDATE fires trg_events_propagate_is_visible
-- (migration 20260618074742), which keeps markets.event_is_visible in sync.
-- ──────────────────────────────────────────────────────────────────────────
update events e
set is_visible = true
where e.is_visible = false
  and e.status <> 'archived'
  and exists (
    select 1 from markets m
    where m.event_id = e.id and m.is_visible = true
  );

update markets m
set is_visible = true
where m.is_visible = false
  and m.status = 'open'
  and exists (
    select 1 from events e
    where e.id = m.event_id and e.is_visible = true
  );
