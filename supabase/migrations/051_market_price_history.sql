-- Migration 051: Market price history RPC for the EventDetailPage chart.
-- Exposes bucketed outcome price timeline to authenticated users. Source is
-- market_data_deltas populated by the Polymarket sync. RLS on deltas stays
-- super_admin-only; SECURITY DEFINER unlocks read access for the RPC.

CREATE OR REPLACE FUNCTION get_market_price_history(
  p_market_id uuid,
  p_since     timestamptz,
  p_until     timestamptz,
  p_bucket    interval
)
RETURNS TABLE (
  outcome_id uuid,
  bucket_ts  timestamptz,
  price      numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      COALESCE(p_since, now() - interval '24 hours') AS since_ts,
      COALESCE(p_until, now())                       AS until_ts,
      COALESCE(p_bucket, interval '15 minutes')      AS bucket_interval
  ),
  deltas AS (
    SELECT
      d.outcome_id,
      d.changed_at,
      NULLIF(d.new_value, '')::numeric AS price
    FROM market_data_deltas d, bounds b
    WHERE d.market_id   = p_market_id
      AND d.event_type  = 'outcome_price_changed'
      AND d.outcome_id IS NOT NULL
      AND d.new_value  IS NOT NULL
      AND d.changed_at >= b.since_ts
      AND d.changed_at <= b.until_ts
  ),
  bucketed AS (
    SELECT
      d.outcome_id,
      to_timestamp(
        floor(extract(epoch FROM d.changed_at) / extract(epoch FROM b.bucket_interval))
        * extract(epoch FROM b.bucket_interval)
      ) AS bucket_ts,
      d.price,
      d.changed_at
    FROM deltas d, bounds b
  ),
  ranked AS (
    SELECT
      outcome_id,
      bucket_ts,
      price,
      row_number() OVER (
        PARTITION BY outcome_id, bucket_ts
        ORDER BY changed_at DESC
      ) AS rn
    FROM bucketed
  )
  SELECT outcome_id, bucket_ts, price
  FROM ranked
  WHERE rn = 1
  ORDER BY bucket_ts ASC, outcome_id ASC;
$$;

REVOKE ALL ON FUNCTION get_market_price_history(uuid, timestamptz, timestamptz, interval) FROM public;
GRANT EXECUTE ON FUNCTION get_market_price_history(uuid, timestamptz, timestamptz, interval) TO authenticated;

COMMENT ON FUNCTION get_market_price_history(uuid, timestamptz, timestamptz, interval) IS
  'Returns bucketed outcome price history for a market. Source: market_data_deltas. '
  'Each bucket keeps the latest price within the bucket window. '
  'SECURITY DEFINER because market_data_deltas RLS is super_admin-only.';
