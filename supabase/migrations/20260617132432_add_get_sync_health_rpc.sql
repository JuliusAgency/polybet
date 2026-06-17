-- get_sync_health(): super-admin sync-freshness probe for the dashboard badge.
--
-- The markets feed depends on the Polymarket sync (market-tracker on Heroku +
-- the edge cron). When market-tracker stops (e.g. the Heroku app was suspended
-- for ~12h on 2026-06-17 and nobody noticed), prices/books silently freeze.
-- This RPC surfaces the freshness so the super-admin dashboard can show a
-- health badge instead of the staleness going unnoticed.
--
-- Source of truth for liveness is market_outcome_books.updated_at — that table
-- is written ONLY by market-tracker's bookWriter (~1/s while healthy), so its
-- max(updated_at) is the tightest "is the live writer alive?" signal. We also
-- return the latest sync_runs row (the edge cron path) for context.
--
-- SECURITY DEFINER because market_outcome_books is not exposed to authenticated
-- via RLS. The function is gated by an explicit is_super_admin() check inside
-- the body, and EXECUTE is revoked from anon (defense in depth) — only the
-- internal check authorizes the data, never the grant alone.
create or replace function public.get_sync_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_books_latest timestamptz;
  v_run_status   text;
  v_run_started  timestamptz;
  v_run_finished timestamptz;
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

  return jsonb_build_object(
    'books_latest_at', v_books_latest,
    'books_stale_seconds',
      case when v_books_latest is null then null
           else floor(extract(epoch from (now() - v_books_latest)))::int end,
    'last_run_status', v_run_status,
    'last_run_started_at', v_run_started,
    'last_run_finished_at', v_run_finished,
    'checked_at', now()
  );
end;
$$;

revoke all on function public.get_sync_health() from public, anon;
grant execute on function public.get_sync_health() to authenticated;
