-- Migration 061: events.tag_slugs — many-to-one array of category slugs.
--
-- Polymarket events carry multiple tags (e.g. "US Election 2028" is tagged
-- politics + elections + trending). Migration 053 denormalized only the first
-- whitelisted tag into tag_slug, so the same event could appear in only one
-- category — leading to sparse category feeds in MarketsFeedPage.
--
-- This migration adds tag_slugs text[] so an event shows up in every matching
-- category. tag_slug is kept for backward compatibility (primary tag used for
-- sorting / default label in EventCard) and is guaranteed to be the first
-- element of tag_slugs.

-- ────────────────────────────────────────────────────────────────
-- 1. Column + GIN index for @> / && containment checks.
-- ────────────────────────────────────────────────────────────────
alter table events
  add column if not exists tag_slugs text[] not null default '{}';

create index if not exists idx_events_tag_slugs
  on events using gin (tag_slugs);

comment on column events.tag_slugs is
  'All Polymarket tag slugs from the whitelist for this event. tag_slug is always the first element. Used for category filters (contains).';

-- ────────────────────────────────────────────────────────────────
-- 2. Backfill from existing tag_slug.
-- ────────────────────────────────────────────────────────────────
update events
   set tag_slugs = array[tag_slug]
 where tag_slug is not null
   and (tag_slugs = '{}' or tag_slugs is null);

-- ────────────────────────────────────────────────────────────────
-- 3. Keep tag_slug and tag_slugs in sync (trigger).
--    Invariant: if tag_slug is set, it must be the first element of tag_slugs.
--    The external market-tracker writes tag_slug directly; this trigger
--    ensures tag_slugs stays consistent until the tracker is updated to
--    supply the full array.
-- ────────────────────────────────────────────────────────────────
create or replace function events_sync_tag_slugs()
returns trigger
language plpgsql
as $$
begin
  if new.tag_slug is null then
    return new;
  end if;

  if new.tag_slugs is null or array_length(new.tag_slugs, 1) is null then
    new.tag_slugs := array[new.tag_slug];
  elsif new.tag_slugs[1] is distinct from new.tag_slug then
    new.tag_slugs := array[new.tag_slug]
                   || array(
                        select s
                          from unnest(new.tag_slugs) s
                         where s is distinct from new.tag_slug
                      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_events_sync_tag_slugs on events;
create trigger trg_events_sync_tag_slugs
  before insert or update of tag_slug, tag_slugs on events
  for each row
  execute function events_sync_tag_slugs();

-- ────────────────────────────────────────────────────────────────
-- 4. Update bulk_upsert_events RPC to accept tag_slugs.
--    Falls back to array[tag_slug] when the caller only supplies the
--    primary tag (the external tracker until it's updated).
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
      nullif(e->>'volume', '')::numeric      as volume,
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
      tag_slug, tag_label, tag_slugs, volume
    )
    select
      i.pid, i.slug, i.title, i.description, i.category, i.image_url,
      i.status, i.close_at, auto_show_all, i.last_synced_at,
      i.tag_slug, i.tag_label, i.tag_slugs, coalesce(i.volume, 0)
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
          tag_slugs      = case
                             when array_length(excluded.tag_slugs, 1) is null then ev.tag_slugs
                             else excluded.tag_slugs
                           end,
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
