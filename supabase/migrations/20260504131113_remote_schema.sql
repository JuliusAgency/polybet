set check_function_bodies = off;

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
          volume         = coalesce(excluded.volume, ev.volume)
    returning ev.polymarket_id, ev.id
  )
  select u.polymarket_id, u.id from upserted u;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cascade_event_lifecycle()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now           timestamptz := now();
  v_archived_cnt  int := 0;
  v_resolved_cnt  int := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
      RAISE EXCEPTION 'Permission denied: only super_admin or service role';
    END IF;
  END IF;

  WITH candidate_events AS (
    SELECT e.id, e.status
    FROM events e
    WHERE e.status IN ('open', 'closed', 'resolved')
  ),
  agg AS (
    SELECT
      ce.id                                         AS event_id,
      ce.status                                     AS event_status,
      bool_and(m.status = 'archived')               AS all_archived,
      bool_and(m.status IN ('resolved', 'archived')) AS all_terminal,
      bool_or (m.status = 'resolved')               AS any_resolved,
      count(*)                                       AS child_count
    FROM candidate_events ce
    JOIN markets m ON m.event_id = ce.id
    GROUP BY ce.id, ce.status
  ),
  to_archive AS (
    SELECT event_id
    FROM agg
    WHERE child_count > 0
      AND all_archived = true
      AND event_status <> 'archived'
  ),
  to_resolve AS (
    SELECT event_id
    FROM agg
    WHERE child_count > 0
      AND all_terminal = true
      AND any_resolved = true
      AND event_status NOT IN ('resolved', 'archived')
  ),
  do_archive AS (
    UPDATE events
    SET status = 'archived', archived_at = v_now
    WHERE id IN (SELECT event_id FROM to_archive)
    RETURNING 1
  ),
  do_resolve AS (
    UPDATE events
    SET status = 'resolved', resolved_at = v_now
    WHERE id IN (SELECT event_id FROM to_resolve)
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM do_archive),
    (SELECT count(*) FROM do_resolve)
  INTO v_archived_cnt, v_resolved_cnt;

  RETURN jsonb_build_object(
    'archived', v_archived_cnt,
    'resolved', v_resolved_cnt
  );
END;
$function$
;


