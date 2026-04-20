-- Migration 056: drop get_market_price_history RPC.
--
-- The chart now fetches directly from Polymarket CLOB /prices-history through
-- the `market-price-history` edge function, so the local bucketing RPC and the
-- market_data_deltas read path it depended on are no longer used by the UI.
-- market_data_deltas itself stays — we still use it for analytics and future
-- server-side alerting on significant price moves.

DROP FUNCTION IF EXISTS get_market_price_history(uuid, timestamptz, timestamptz, interval);
