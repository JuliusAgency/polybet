-- Migration 073: bulk_upsert_events — stop downgrading terminal events
--
-- Background. The market-tracker sync polls Polymarket Gamma every minute
-- and pipes a fresh status (open/closed/resolved) into bulk_upsert_events.
-- Polymarket frequently leaves event.resolved=null/false even on de-facto
-- resolved events, so the sync sees `closed=true, resolved=null` and writes
-- `status='closed'`.
--
-- Separately, cascade_event_lifecycle (migration 072) flips an event to
-- 'resolved' once all its child markets reach terminal state. Combined,
-- the two layers fight each other every cycle:
--   T+0s  cascade        : event → 'resolved'      (resolved_at = now())
--   T+30s bulk_upsert    : event → 'closed'       (resolved_at unchanged but status reverts)
--   T+5m  cascade        : event → 'resolved'     (resolved_at refreshed AGAIN)
--   ...
--
-- Symptoms in production logs (post-072 deploy): cascadeEventsTick reports
-- `resolved=200..520` every 5 minutes indefinitely, while the totals in the
-- events table barely grow — the same set of events is being re-resolved
-- on every cycle. resolved_at gets clobbered each tick, so the column
-- becomes useless for "when did this actually resolve" questions.
--
-- Fix: in the upsert ON CONFLICT branch, refuse to downgrade an event whose
-- DB-side status is already 'resolved' or 'archived'. Treat those as sticky
-- terminal states. Going forward, only cascade_event_lifecycle (and the
-- archiver path that flips to 'archived') can transition out of them.

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
