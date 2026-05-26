-- QA 2026-05-25 (Bug 4): "Insufficient liquidity for this stake" gave the user no
-- idea what they COULD bet. Extend quote_bet_payout to also return available_stake
-- = total USD depth across all ask levels (Σ price*size), so the UI can show
-- "Maximum available stake: X". RETURNS TABLE changes → DROP + CREATE.
-- place_bet selects columns by name (shares, effective_odds, partial,
-- book_updated_at) and is plpgsql, so adding a trailing column is safe.

DROP FUNCTION IF EXISTS quote_bet_payout(text, numeric);

CREATE FUNCTION quote_bet_payout(
  p_token_id text,
  p_stake    numeric
) RETURNS TABLE (
  shares          numeric,
  filled_stake    numeric,
  avg_price       numeric,
  effective_odds  numeric,
  partial         boolean,
  book_updated_at timestamptz,
  available_stake numeric
)
LANGUAGE plpgsql STABLE
SET search_path = public AS $$
DECLARE
  v_asks       numeric[];
  v_updated    timestamptz;
  v_i          int := 1;
  v_len        int;
  v_remaining  numeric := p_stake;
  v_price      numeric;
  v_size       numeric;
  v_take_usd   numeric;
  v_take_units numeric;
  v_shares     numeric := 0;
  v_filled     numeric := 0;
  v_available  numeric := 0;
BEGIN
  IF p_stake IS NULL OR p_stake <= 0 THEN
    RETURN QUERY SELECT
      0::numeric, 0::numeric, 0::numeric, 0::numeric, true, NULL::timestamptz, 0::numeric;
    RETURN;
  END IF;

  SELECT asks, updated_at
  INTO v_asks, v_updated
  FROM market_outcome_books
  WHERE polymarket_token_id = p_token_id;

  IF v_asks IS NULL OR cardinality(v_asks) < 2 THEN
    -- No book row, or row exists but asks is empty. Treat as zero liquidity.
    RETURN QUERY SELECT
      0::numeric, 0::numeric, 0::numeric, 0::numeric, true, v_updated, 0::numeric;
    RETURN;
  END IF;

  v_len := cardinality(v_asks);

  -- Total available depth (USD) across every valid level — independent of stake.
  WHILE v_i < v_len LOOP
    v_price := v_asks[v_i];
    v_size  := v_asks[v_i + 1];
    IF v_price IS NOT NULL AND v_size IS NOT NULL AND v_price > 0 AND v_size > 0 THEN
      v_available := v_available + (v_price * v_size);
    END IF;
    v_i := v_i + 2;
  END LOOP;

  -- Walk asks to fill p_stake. Array is stored flat as [p0, s0, p1, s1, ...]
  -- sorted by price ascending — bookWriter guarantees this.
  v_i := 1;
  WHILE v_i < v_len AND v_remaining > 0 LOOP
    v_price := v_asks[v_i];
    v_size  := v_asks[v_i + 1];

    IF v_price IS NULL OR v_size IS NULL OR v_price <= 0 OR v_size <= 0 THEN
      v_i := v_i + 2;
      CONTINUE;
    END IF;

    v_take_usd   := LEAST(v_remaining, v_price * v_size);
    v_take_units := v_take_usd / v_price;
    v_shares     := v_shares + v_take_units;
    v_filled     := v_filled + v_take_usd;
    v_remaining  := v_remaining - v_take_usd;
    v_i          := v_i + 2;
  END LOOP;

  RETURN QUERY SELECT
    v_shares                                                       AS shares,
    v_filled                                                       AS filled_stake,
    CASE WHEN v_shares > 0 THEN v_filled / v_shares ELSE 0 END     AS avg_price,
    CASE WHEN p_stake > 0  THEN v_shares / p_stake ELSE 0 END      AS effective_odds,
    v_remaining > 0                                                AS partial,
    v_updated                                                      AS book_updated_at,
    v_available                                                    AS available_stake;
END;
$$;

GRANT EXECUTE ON FUNCTION quote_bet_payout(text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION quote_bet_payout(text, numeric) TO anon;
GRANT EXECUTE ON FUNCTION quote_bet_payout(text, numeric) TO service_role;

COMMENT ON FUNCTION quote_bet_payout(text, numeric) IS
  'Walks market_outcome_books.asks for p_token_id and returns slippage-adjusted payout for p_stake. partial=true when book depth is insufficient. available_stake = total USD depth across all ask levels.';
