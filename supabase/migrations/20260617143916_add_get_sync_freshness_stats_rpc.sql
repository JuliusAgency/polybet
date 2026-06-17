-- get_sync_freshness_stats(): ON-DEMAND average data-freshness for the dashboard.
--
-- Separate from get_sync_health() (which is cheap and auto-polls every 60s for
-- the liveness badge) because these averages scan large tables:
--   - markets price freshness: avg age of market_outcomes.updated_at across the
--     outcomes of OPEN visible markets (~10.7k markets / ~21k outcomes). This is
--     the real "are prices being written" signal (market-tracker writes prices).
--   - events sync freshness: avg age of events.last_synced_at across OPEN visible
--     events (events have no price; last_synced_at is their only update signal).
--
-- These are full scans (~1-2.5s), so this RPC is invoked on explicit admin
-- request (a button), never on a poll. Note the averages are dominated by the
-- large dormant tail of nominally-open-but-inactive markets, so values in the
-- range of weeks are expected and normal — the tight liveness signal stays
-- get_sync_health().books_stale_seconds (market_outcome_books, ~seconds).
--
-- SECURITY DEFINER + internal is_super_admin() gate (market_outcomes/markets
-- joins are not exposed to authenticated via RLS for this aggregate); EXECUTE
-- revoked from anon.
create or replace function public.get_sync_freshness_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_markets_open       int;
  v_markets_price_avg  int;
  v_events_open        int;
  v_events_sync_avg    int;
begin
  if not is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select count(distinct m.id),
         round(avg(extract(epoch from (now() - mo.updated_at))))::int
    into v_markets_open, v_markets_price_avg
  from markets m
  join market_outcomes mo on mo.market_id = m.id
  where m.is_visible and m.status = 'open' and mo.updated_at is not null;

  select count(*),
         round(avg(extract(epoch from (now() - last_synced_at))))::int
    into v_events_open, v_events_sync_avg
  from events
  where is_visible and status = 'open' and last_synced_at is not null;

  return jsonb_build_object(
    'markets_open', coalesce(v_markets_open, 0),
    'markets_price_avg_seconds', v_markets_price_avg,
    'events_open', coalesce(v_events_open, 0),
    'events_sync_avg_seconds', v_events_sync_avg,
    'computed_at', now()
  );
end;
$$;

revoke all on function public.get_sync_freshness_stats() from public, anon;
grant execute on function public.get_sync_freshness_stats() to authenticated;
