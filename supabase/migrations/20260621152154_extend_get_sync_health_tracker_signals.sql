-- Extend get_sync_health() with the additional sync dimensions surfaced on the
-- super-admin dashboard health card. Adds, on top of the existing books + last
-- sync_run signals:
--
--   * tracker heartbeat  — system_settings.tracker_heartbeat, upserted ~every 10s
--                          by market-tracker. Carries the CLOB websocket link
--                          state (ws_connected), subscribed token count, and the
--                          last trending-rankings refresh time — signals that
--                          otherwise live ONLY in the tracker process's memory.
--   * events freshness   — max(events.last_synced_at): when eventCrawl last wrote
--                          the catalog (~5 min cadence).
--   * settlement backlog — resolved markets that still have open positions.
--
-- Prices are written by market-tracker over the CLOB websocket (NOT edge
-- functions), so book/heartbeat recency — not sync_runs — is the real price
-- liveness signal. Still SECURITY DEFINER + in-body is_super_admin() gate; the
-- heartbeat key is not exposed to anon/authenticated by RLS, only via this RPC.
create or replace function public.get_sync_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_books_latest  timestamptz;
  v_run_status    text;
  v_run_started   timestamptz;
  v_run_finished  timestamptz;
  v_hb            jsonb;
  v_hb_at         timestamptz;
  v_trending_at   timestamptz;
  v_events_latest timestamptz;
  v_pending       int;
  v_now           timestamptz := now();
begin
  if not is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select max(updated_at) into v_books_latest from market_outcome_books;

  select status, started_at, finished_at
    into v_run_status, v_run_started, v_run_finished
  from sync_runs
  order by started_at desc nulls last
  limit 1;

  -- Tracker liveness heartbeat (WS link, subscribed tokens, trending refresh).
  -- Absent (null) until market-tracker has run at least once since this RPC.
  select value into v_hb from system_settings where key = 'tracker_heartbeat';
  v_hb_at       := nullif(v_hb->>'at', '')::timestamptz;
  v_trending_at := nullif(v_hb->>'last_trending_at', '')::timestamptz;

  -- Catalog freshness: most recent eventCrawl write (events.last_synced_at).
  select max(last_synced_at) into v_events_latest from events;

  -- Settlement backlog: resolved markets that still carry open positions.
  select count(distinct m.id) into v_pending
  from markets m
  join market_outcomes mo on mo.market_id = m.id
  join positions p on p.outcome_id = mo.id
  where m.status = 'resolved' and p.status = 'open';

  return jsonb_build_object(
    'books_latest_at', v_books_latest,
    'books_stale_seconds',
      case when v_books_latest is null then null
           else floor(extract(epoch from (v_now - v_books_latest)))::int end,
    'last_run_status', v_run_status,
    'last_run_started_at', v_run_started,
    'last_run_finished_at', v_run_finished,
    'tracker_heartbeat_at', v_hb_at,
    'tracker_stale_seconds',
      case when v_hb_at is null then null
           else floor(extract(epoch from (v_now - v_hb_at)))::int end,
    'ws_connected', (v_hb->>'ws_connected')::boolean,
    'subscribed_tokens', (v_hb->>'subscribed_tokens')::int,
    'last_trending_at', v_trending_at,
    'trending_stale_seconds',
      case when v_trending_at is null then null
           else floor(extract(epoch from (v_now - v_trending_at)))::int end,
    'events_latest_at', v_events_latest,
    'events_stale_seconds',
      case when v_events_latest is null then null
           else floor(extract(epoch from (v_now - v_events_latest)))::int end,
    'pending_settlements', coalesce(v_pending, 0),
    'checked_at', v_now
  );
end;
$$;

revoke all on function public.get_sync_health() from public, anon;
grant execute on function public.get_sync_health() to authenticated;
