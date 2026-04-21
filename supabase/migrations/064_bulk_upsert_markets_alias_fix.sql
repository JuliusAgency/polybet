-- Migration 064: fix "column u.market_id does not exist" (SQLSTATE 42703)
-- in bulk_upsert_markets introduced by migration 063.
--
-- The inner CTE returns `mk.id` but the outer SELECT references `u.market_id`,
-- which never existed. Alias the id column inside the CTE so the outer SELECT
-- and the declared RETURNS TABLE column match.

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
