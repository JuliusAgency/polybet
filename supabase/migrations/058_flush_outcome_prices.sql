-- Migration 058: flush_outcome_prices RPC for market-tracker WebSocket flushes.
--
-- Replaces the previous pattern in services/market-tracker/src/db/batchWriter.ts
-- where live CLOB price updates were pushed via `.upsert(..., { onConflict: ... })`
-- against market_outcomes. That path occasionally INSERTed new rows (when the
-- WebSocket delivered a tick for a token whose REST-synced outcome row did not
-- yet exist) and failed with NOT NULL violations on `name`, because the WS path
-- has no authoritative outcome name — that only comes from Gamma REST.
--
-- This RPC performs a pure UPDATE join: rows without a matching (market_id,
-- polymarket_token_id) pair are silently ignored (the next REST sync will
-- create them with proper name/price). Returns number of rows actually updated
-- so the caller can detect REST/WS desync.

create or replace function flush_outcome_prices(updates jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count int;
begin
  with input as (
    select
      (e->>'market_id')::uuid          as market_id,
      e->>'polymarket_token_id'        as token_id,
      (e->>'price')::numeric           as price,
      (e->>'odds')::numeric            as odds,
      (e->>'effective_odds')::numeric  as effective_odds,
      (e->>'updated_at')::timestamptz  as updated_at
    from jsonb_array_elements(updates) e
  )
  update market_outcomes mo
  set price          = i.price,
      odds           = i.odds,
      effective_odds = i.effective_odds,
      updated_at     = i.updated_at
  from input i
  where mo.market_id = i.market_id
    and mo.polymarket_token_id = i.token_id;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function flush_outcome_prices(jsonb) from public;
revoke all on function flush_outcome_prices(jsonb) from anon;
revoke all on function flush_outcome_prices(jsonb) from authenticated;
grant execute on function flush_outcome_prices(jsonb) to service_role;
