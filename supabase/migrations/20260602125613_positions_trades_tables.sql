-- Migration: positions + trades — the Polymarket-style trading model
--
-- PolyBet is moving from a "buy a bet, hold it to resolution" model to a true
-- exchange model where a user holds a POSITION in an outcome and can SELL
-- (fully or partially) before the market resolves. This migration introduces
-- the two tables that back that model:
--
--   * positions — the MUTABLE aggregate. One row per (user, outcome). Holds the
--     net share count, the volume-weighted average entry price (cost basis),
--     the cost basis currently locked in balances.in_play, lifetime realized
--     P/L, and a lifecycle status. Every buy/sell/settlement mutates this row.
--
--   * trades — the IMMUTABLE ledger. One row per fill (a single buy or sell).
--     Append-only, never updated. This is the audit trail / history; positions
--     is the fast aggregate derived from it. A buy/sell writes exactly one
--     trades row and updates exactly one positions row in the same RPC.
--
-- Accounting model (enforced by the RPCs in later migrations, documented here
-- so the schema reads in context):
--   BUY  cost C, get S shares:  in_play += C; position.shares += S;
--        avg_price recomputed weighted; cost_basis += C.
--   SELL N shares, proceeds P:  in_play -= N*avg_price; available += P;
--        position.shares -= N; avg_price UNCHANGED; realized_pnl += P - N*avg_price.
--   SETTLE win:  available += shares*$1; in_play -= cost_basis; realized += shares - cost_basis.
--   SETTLE lose: in_play -= cost_basis; realized -= cost_basis.
-- Invariant: balances.in_play == SUM(cost_basis) over a user's open positions.
--
-- The legacy `bets` table is NOT dropped — balance_transactions.bet_id and the
-- settlement-log tables still reference it, and it is the historical record of
-- the pre-trading era. A later migration backfills positions+trades from it.
--
-- Data API note: as of Supabase's 2026-04-28 change, new public tables are not
-- auto-exposed to the Data/REST API — explicit GRANT SELECT to `authenticated`
-- is required (the frontend reads positions/trades directly via PostgREST).
-- Writes happen only through SECURITY DEFINER RPCs, so no INSERT/UPDATE grants
-- are given to client roles. RLS still gates which rows each user can read.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. positions — mutable aggregate, one row per (user, outcome)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE positions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES profiles(id),
  market_id     uuid        NOT NULL REFERENCES markets(id),
  outcome_id    uuid        NOT NULL REFERENCES market_outcomes(id),
  -- Net shares currently held. 0 when fully sold out (status='closed') and the
  -- row is dormant until a re-buy reopens it.
  shares        numeric     NOT NULL DEFAULT 0 CHECK (shares >= 0),
  -- Volume-weighted average fill price = cost basis per share, in (0,1). Set on
  -- the first buy and recomputed on every subsequent buy; UNCHANGED by sells. A
  -- closed position keeps its last avg_price (harmless: cost_basis is 0).
  avg_price     numeric     NOT NULL CHECK (avg_price > 0 AND avg_price < 1),
  -- = shares * avg_price. The portion of this position currently locked in
  -- balances.in_play. Denormalized so settlement/sell never have to recompute.
  cost_basis    numeric     NOT NULL DEFAULT 0 CHECK (cost_basis >= 0),
  -- Lifetime realized P/L: crystallized on every sell and at settlement. May be
  -- negative (net losses). Carries across close/reopen cycles.
  realized_pnl  numeric     NOT NULL DEFAULT 0,
  status        text        NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'closed', 'won', 'lost')),
  opened_at     timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  settled_at    timestamptz,
  -- One position per side per user. Buys/sells of the same outcome aggregate
  -- into this single row (the upsert target in place_bet / sell_position).
  CONSTRAINT positions_user_outcome_unique UNIQUE (user_id, outcome_id)
);

-- Portfolio read: a user's open positions.
CREATE INDEX idx_positions_user_open   ON positions(user_id) WHERE status = 'open';
CREATE INDEX idx_positions_user        ON positions(user_id);
-- Settlement walks open positions for a market.
CREATE INDEX idx_positions_market_open ON positions(market_id) WHERE status = 'open';
CREATE INDEX idx_positions_outcome     ON positions(outcome_id);

COMMENT ON TABLE positions IS
  'Mutable per-(user,outcome) aggregate of the shares model. shares=net held, avg_price=cost basis, cost_basis=shares*avg_price locked in in_play, realized_pnl=lifetime. Written only by place_bet/sell_position/settle_market RPCs.';
COMMENT ON COLUMN positions.cost_basis IS
  'shares*avg_price; the amount of this position currently locked in balances.in_play. Invariant: in_play = SUM(cost_basis) over a user open positions.';
COMMENT ON COLUMN positions.avg_price IS
  'Volume-weighted average entry price in (0,1). Recomputed on buy, UNCHANGED on sell. Share price in cents = round(avg_price*100).';
COMMENT ON COLUMN positions.realized_pnl IS
  'Lifetime realized profit/loss: crystallized on each sell (proceeds - shares*avg_price) and at settlement. May be negative.';

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

-- RLS mirrors the bets policies (008): own rows, manager via manager_user_links,
-- super_admin all. Reads only; all writes go through SECURITY DEFINER RPCs.
CREATE POLICY "Users read own positions" ON positions FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "Managers read linked user positions" ON positions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM manager_user_links mul
      JOIN profiles mp ON mp.id = mul.manager_id
      WHERE mul.user_id = positions.user_id
        AND mul.manager_id = (select auth.uid())
        AND mp.role = 'manager'
    )
  );

CREATE POLICY "Super admin reads all positions" ON positions FOR SELECT
  USING (is_super_admin());

GRANT SELECT ON positions TO authenticated;
-- Defense in depth: there is no write RLS policy, but make the absence of write
-- access explicit so default public-schema ACLs cannot silently grant it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON positions FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. trades — immutable fill ledger, one row per buy/sell
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE trades (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id   uuid        NOT NULL REFERENCES positions(id),
  user_id       uuid        NOT NULL REFERENCES profiles(id),
  market_id     uuid        NOT NULL REFERENCES markets(id),
  outcome_id    uuid        NOT NULL REFERENCES market_outcomes(id),
  side          text        NOT NULL CHECK (side IN ('buy', 'sell')),
  -- Shares transacted in THIS fill (always positive; `side` carries direction).
  shares        numeric     NOT NULL CHECK (shares > 0),
  -- Volume-weighted fill price for this trade, in (0,1).
  price         numeric     NOT NULL CHECK (price > 0 AND price < 1),
  -- USD spent (buy) or received (sell). = shares * price.
  usd           numeric     NOT NULL CHECK (usd > 0),
  -- Realized P/L crystallized by this fill. 0 for buys; (proceeds - shares*avg)
  -- for sells.
  realized_pnl  numeric     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trades_position     ON trades(position_id);
CREATE INDEX idx_trades_user_created ON trades(user_id, created_at DESC);
CREATE INDEX idx_trades_market       ON trades(market_id);

COMMENT ON TABLE trades IS
  'Immutable append-only ledger of buy/sell fills. One row per fill; positions is the aggregate derived from these. Written only by place_bet/sell_position RPCs.';

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own trades" ON trades FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "Managers read linked user trades" ON trades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM manager_user_links mul
      JOIN profiles mp ON mp.id = mul.manager_id
      WHERE mul.user_id = trades.user_id
        AND mul.manager_id = (select auth.uid())
        AND mp.role = 'manager'
    )
  );

CREATE POLICY "Super admin reads all trades" ON trades FOR SELECT
  USING (is_super_admin());

GRANT SELECT ON trades TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON trades FROM anon, authenticated;
