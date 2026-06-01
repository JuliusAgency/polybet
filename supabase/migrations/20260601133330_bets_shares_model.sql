-- Migration A: shares model on bets
--
-- PolyBet moves its betting *language* from a bookmaker odds-multiplier
-- framing to a Polymarket-style shares framing: a user buys shares at a
-- price in (0,1), each winning share pays $1, net profit = shares - stake,
-- no reselling. The backend already computed this when an order book is
-- present (quote_bet_payout walks the CLOB asks and returns shares /
-- avg_price; place_bet stored potential_payout = shares). This migration
-- makes shares and avg_price first-class, persisted columns on `bets` so the
-- whole stack can speak shares directly instead of deriving them from odds.
--
-- locked_odds and potential_payout are kept (DEPRECATED) for backward
-- compatibility: settle_market and several frontend readers still reference
-- potential_payout, and place_bet keeps writing locked_odds = shares/stake.
--
-- Price band note: we deliberately use the open interval (0,1) for avg_price,
-- NOT (0.01, 0.99). Migration 20260520143159 removed the 0.01/0.99 floor for
-- Polymarket parity; quote_bet_payout legitimately fills sub-cent and
-- super-99c levels. "$0.01-$0.99" is a UI display convention, not a storage
-- constraint. Rejecting long-tail fills here would contradict shipped
-- behaviour.

ALTER TABLE bets
  ADD COLUMN shares    numeric,
  ADD COLUMN avg_price numeric;

COMMENT ON COLUMN bets.shares IS
  'Gross payout on win: number of $1 shares acquired for the stake (slippage-adjusted from the order book). Authoritative; potential_payout mirrors it for back-compat.';
COMMENT ON COLUMN bets.avg_price IS
  'Volume-weighted average fill price in (0,1). Share price in cents = round(avg_price*100).';
COMMENT ON COLUMN bets.locked_odds IS
  'DEPRECATED — legacy odds multiplier (= shares/stake = 1/avg_price). Kept for back-compat; prefer shares/avg_price.';
COMMENT ON COLUMN bets.potential_payout IS
  'DEPRECATED — mirrors `shares` (each share pays $1). Kept for back-compat; prefer shares.';

-- Backfill existing rows. shares == potential_payout exactly (on the book
-- path payout already equals shares; on the legacy fallback path
-- payout = stake*odds is the correct $1-per-share equivalent).
-- avg_price = stake/potential_payout = 1/locked_odds.
UPDATE bets
SET shares    = potential_payout,
    avg_price = CASE WHEN potential_payout > 0 THEN stake / potential_payout ELSE NULL END
WHERE shares IS NULL;

-- Defensive clamp so VALIDATE CONSTRAINT cannot fail on a degenerate legacy
-- row (e.g. a hand-adjusted payout that produced avg_price exactly 0 or >=1).
UPDATE bets
SET avg_price = least(0.999999, greatest(0.000001, avg_price))
WHERE avg_price IS NOT NULL;

-- Constraints added NOT VALID then VALIDATE to avoid holding ACCESS EXCLUSIVE
-- for a full table scan on prod.
ALTER TABLE bets
  ADD CONSTRAINT bets_shares_positive    CHECK (shares > 0)                      NOT VALID,
  ADD CONSTRAINT bets_avg_price_in_range CHECK (avg_price > 0 AND avg_price < 1) NOT VALID;

ALTER TABLE bets VALIDATE CONSTRAINT bets_shares_positive;
ALTER TABLE bets VALIDATE CONSTRAINT bets_avg_price_in_range;

-- Backfill guaranteed both columns non-null for every existing row
-- (potential_payout has a CHECK > 0, so stake/potential_payout is defined).
ALTER TABLE bets
  ALTER COLUMN shares    SET NOT NULL,
  ALTER COLUMN avg_price SET NOT NULL;
