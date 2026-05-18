-- Migration: market_outcome_books — order book cache for accurate payout quotes
--
-- Background: priceToOdds across all three sync runtimes computes
-- effective_odds = 1 / market_outcomes.price, which is the top-of-book mid.
-- Polymarket's "To win" walks the order book and uses the slippage-adjusted
-- average fill price. On low-priced outcomes the gap is huge: $100 at 1.0¢
-- displays as $10000 here vs $8573 on Polymarket. That gap is an arbitrage
-- against the house.
--
-- This table caches the top-N CLOB levels per outcome, written by the
-- market-tracker service from the same WS channel that drives prices. The
-- quote_bet_payout SQL helper (separate migration) walks these levels in
-- plpgsql to produce the actual payout. place_bet (separate migration) reads
-- the same helper so what the UI shows is exactly what gets locked in.
--
-- Schema choices:
--   * polymarket_token_id is the natural PK (CLOB asset_id, also stored on
--     market_outcomes.polymarket_token_id). One book per outcome side.
--   * asks/bids are FLAT numeric[] interleaved [p0, s0, p1, s1, ...] rather
--     than jsonb. The walk in quote_bet_payout is a hot path inside place_bet
--     under FOR UPDATE on the market row; plpgsql array indexing is ~10x
--     faster than jsonb_array_elements + cast per iteration.
--   * hash mirrors Polymarket's book hash so bookWriter can skip no-op writes.
--   * NOT added to supabase_realtime publication: high-write cross-user data
--     per project realtime policy (see CLAUDE.md). Clients poll via RPC.

CREATE TABLE market_outcome_books (
  polymarket_token_id  text        PRIMARY KEY,
  outcome_id           uuid        NOT NULL REFERENCES market_outcomes(id) ON DELETE CASCADE,
  asks                 numeric[]   NOT NULL DEFAULT '{}',
  bids                 numeric[]   NOT NULL DEFAULT '{}',
  hash                 text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX market_outcome_books_outcome_id_idx
  ON market_outcome_books(outcome_id);

CREATE INDEX market_outcome_books_updated_at_idx
  ON market_outcome_books(updated_at);

ALTER TABLE market_outcome_books ENABLE ROW LEVEL SECURITY;

-- Reads: any authenticated user. The book is public market data (mirrors
-- Polymarket's public REST), no per-user partitioning needed.
CREATE POLICY market_outcome_books_select_authenticated
  ON market_outcome_books
  FOR SELECT
  TO authenticated
  USING (true);

-- Writes: service role only. market-tracker writes via service-role key,
-- same as every other sync write. No user-side mutation path.

COMMENT ON TABLE market_outcome_books IS
  'CLOB order book top-N cache per outcome. Written by market-tracker WS pipeline. Source of truth for bet payout quotes (see quote_bet_payout()).';

COMMENT ON COLUMN market_outcome_books.asks IS
  'Top-N ask levels as flat [p0,s0,p1,s1,...]. Sorted ascending by price.';

COMMENT ON COLUMN market_outcome_books.bids IS
  'Top-N bid levels as flat [p0,s0,p1,s1,...]. Sorted descending by price.';

COMMENT ON COLUMN market_outcome_books.hash IS
  'Polymarket CLOB book hash. bookWriter skips DB write if unchanged.';
