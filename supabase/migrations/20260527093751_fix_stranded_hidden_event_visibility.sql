-- Migration: fix events stranded at is_visible=false (and their markets, which
-- RLS then hides too).
--
-- Background. Events first synced during the 2026-04-20 backfill were inserted
-- while sync_auto_show_all was OFF, so they got is_visible=false. bulk_upsert_events
-- (migration 073) never touches is_visible on conflict, so flipping
-- sync_auto_show_all back ON never promoted those rows — they stayed hidden
-- forever. Their child markets were re-created later with is_visible=true, but
-- the markets RLS policy (migration 20260508091612) requires the PARENT event to
-- be visible, so the visible markets were filtered out too. Net effect: a fully
-- synced, high-volume event (e.g. "2026 FIFA World Cup Winner", polymarket_id
-- 30615, $1.2B volume) was invisible to every non-admin user.
--
-- Fix, two parts:
--   1. Forward-fix the two bulk-upsert RPCs so is_visible is promoted when
--      auto_show_all is true, while preserving the "no downgrade" guarantee from
--      migration 073: is_visible = <current> OR auto_show_all.
--        - auto_show_all=true  -> hidden rows become visible (current product
--          posture: "show everything that passed the volume threshold").
--        - auto_show_all=false -> existing value preserved, never downgraded
--          (moderation mode).
--   2. One-time backfill of the existing stranded rows.

-- ──────────────────────────────────────────────────────────────────────────
-- 1a. bulk_upsert_events — body copied verbatim from migration 073, with one
--     added line in the ON CONFLICT SET clause (is_visible promotion).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_upsert_events(events jsonb, auto_show_all boolean)
RETURNS TABLE(polymarket_id text, event_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
          -- Promote hidden events to visible when auto-show is on; never
          -- downgrade a visible event (mirrors the "no downgrade" intent of
          -- migration 073, now applied to visibility). When auto_show_all is
          -- false this is a no-op (preserves the current value).
          is_visible     = ev.is_visible or auto_show_all,
          -- Status is sticky in terminal states. Once cascade_event_lifecycle
          -- (migration 072) flips an event to 'resolved' or 'archived', the
          -- minute-cadence sync from Gamma must NOT pull it back to 'closed'
          -- just because Polymarket leaves event.resolved=null on already
          -- decided events.
          status         = case
                             when ev.status in ('resolved', 'archived') then ev.status
                             else excluded.status
                           end,
          close_at       = excluded.close_at,
          last_synced_at = excluded.last_synced_at,
          tag_slug       = coalesce(excluded.tag_slug, ev.tag_slug),
          tag_label      = coalesce(excluded.tag_label, ev.tag_label),
          tag_slugs      = (
            -- Order-preserving union: keep existing slugs in their original
            -- order, then append any incoming slugs that are not already
            -- present.
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
$function$;

-- ──────────────────────────────────────────────────────────────────────────
-- 1b. bulk_upsert_markets — body copied verbatim from migration 064, with one
--     added line in the ON CONFLICT SET clause. NOTE: the existing-row alias
--     here is `mk` (not `ev`), so we reference mk.is_visible.
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
          -- Promote hidden markets to visible when auto-show is on; never
          -- downgrade. No-op when auto_show_all is false (preserves current).
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
          source_updated_at = excluded.source_updated_at
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
-- 2. One-time backfill of the existing stranded rows. Idempotent — re-running
--    on an already-fixed DB (or a fresh seed) matches nothing and is a no-op.
-- ──────────────────────────────────────────────────────────────────────────

-- Show every non-archived event that already has at least one visible market.
-- These are the "visible markets under a hidden parent" rows that RLS was
-- silently filtering out.
update events e
set is_visible = true
where e.is_visible = false
  and e.status <> 'archived'
  and exists (
    select 1 from markets m
    where m.event_id = e.id and m.is_visible = true
  );

-- Surface open markets under the events we just made visible, so each card is
-- complete immediately instead of waiting for the next sync tick to promote
-- them via the fixed RPC above.
update markets m
set is_visible = true
where m.is_visible = false
  and m.status = 'open'
  and exists (
    select 1 from events e
    where e.id = m.event_id and e.is_visible = true
  );
