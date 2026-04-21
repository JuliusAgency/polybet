-- Migration 065: union-merge tag_slugs on bulk_upsert_events.
--
-- Before: on conflict we replaced `tag_slugs` with the incoming array, so when
-- market-tracker flushed categories sequentially the second flush for the same
-- event would clobber the slug from the first one. That forced the tracker to
-- accumulate every category in memory before a single flush, which OOM'd the
-- Heroku dyno once `sports` alone returned ~5000 events.
--
-- After: we union the incoming slugs with the stored ones while preserving the
-- order of the first occurrence (so `trending` wins primary placement when it
-- was seen first). Empty incoming arrays are ignored. This lets the tracker
-- flush per category and the DB takes care of the merge across runs.

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
          tag_slugs      = (
            -- Order-preserving union: keep existing slugs in their original
            -- order, then append any incoming slugs that are not already
            -- present. Postgres has no built-in "ordered distinct concat", so
            -- we build it inline with an ordered subquery.
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
