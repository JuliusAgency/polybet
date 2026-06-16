-- Migration: World Cup "Games" tab metadata.
--
-- The Games tab (Polymarket /sports/world-cup/games) renders one card per match
-- (e.g. "France vs. Senegal"). Upstream, a match is a Gamma EVENT carrying:
--   - sport metadata + a kickoff time (startTime)
--   - a `teams` array (name / abbreviation / logo / record / color / ordering)
--   - 1..N child markets each tagged with a sportsMarketType
--     (moneyline / spreads / totals), where spread/total markets carry a `line`.
--
-- We already sync the moneyline markets (they match the fifa-world-cup tag), so
-- this migration only adds the columns needed to (a) identify which events are
-- games and (b) render the team header + per-market-type columns. The sync
-- (market-tracker + sync-polymarket-markets edge) populates them; betting is
-- unchanged (a moneyline market is an ordinary binary Yes/No market).
--
-- A "game" event is identified app-side by `sport IS NOT NULL` (only sports
-- match events carry it). `teams` and `game_start_time` drive the card header
-- and the date grouping. `markets.sports_market_type` + `markets.line` let the
-- UI split a game's markets into the Moneyline / Spread / Total columns.

-- ---------------------------------------------------------------------------
-- Schema: new nullable columns. All default NULL so existing rows are valid
-- and non-sports events simply leave them empty.
-- ---------------------------------------------------------------------------
alter table events
  add column if not exists game_start_time timestamptz,
  add column if not exists sport text,
  add column if not exists teams jsonb;

comment on column events.game_start_time is
  'Kickoff time for sports match events (Gamma event.startTime). NULL for non-game events.';
comment on column events.sport is
  'Sport slug for match events (e.g. ''fifwc''). Non-NULL marks the event as a "game" for the Games tab.';
comment on column events.teams is
  'Gamma event.teams array: [{name, abbreviation, logo, record, color, ordering}]. NULL for non-game events.';

alter table markets
  add column if not exists sports_market_type text,
  add column if not exists line numeric;

comment on column markets.sports_market_type is
  'Gamma market.sportsMarketType (moneyline | spreads | totals | ...). NULL for non-sports markets.';
comment on column markets.line is
  'Spread / total handicap line for sports markets (Gamma market.line). NULL for moneyline / non-sports.';

-- Feed index for the Games tab: world-cup game events ordered by kickoff.
-- Partial on sport IS NOT NULL so it only carries match rows.
create index if not exists idx_events_world_cup_games
  on events (game_start_time, id)
  where sport is not null and is_visible = true;

-- ---------------------------------------------------------------------------
-- bulk_upsert_events — add game_start_time / sport / teams (faithful copy of
-- migration 065, extended). New fields use coalesce-on-update so a later sync
-- without them never erases previously captured metadata.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- bulk_upsert_markets — add sports_market_type / line (faithful copy of
-- migration 064, extended).
-- ---------------------------------------------------------------------------
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
