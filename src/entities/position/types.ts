// Domain primitives for the positions/trades trading model.
//
// A Position is the mutable per-(user,outcome) aggregate (shares held, the
// volume-weighted entry price, lifetime realized P/L). A Trade is one immutable
// buy/sell fill. Both mirror the DB tables created in
// 20260602125613_positions_trades_tables.sql.

export type PositionStatus = 'open' | 'closed' | 'won' | 'lost';

export interface Position {
  id: string;
  market_id: string;
  outcome_id: string;
  /** Net shares currently held. */
  shares: number;
  /** Volume-weighted average entry price in (0,1). Cents = round(avg_price*100). */
  avg_price: number;
  /** shares * avg_price; the amount locked in balances.in_play. */
  cost_basis: number;
  /** Lifetime realized profit/loss (sells + settlement). May be negative. */
  realized_pnl: number;
  status: PositionStatus;
  opened_at: string;
  updated_at: string;
  settled_at: string | null;
  markets: {
    question: string;
    status: 'open' | 'closed' | 'resolved' | 'archived';
    winning_outcome_id: string | null;
    last_synced_at: string | null;
    event_id: string | null;
  } | null;
  market_outcomes: {
    name: string;
    /** CLOB token id — needed to fetch the live sell (bid) quote. */
    polymarket_token_id: string | null;
    /** Current top-of-book price (mid) — a cheap mark for the portfolio list.
     *  The exact slippage-adjusted sell value comes from quote_sell_proceeds. */
    price: number | null;
  } | null;
}

export type TradeSide = 'buy' | 'sell';

export interface Trade {
  id: string;
  position_id: string;
  market_id: string;
  outcome_id: string;
  side: TradeSide;
  /** Shares transacted in this fill (always positive; `side` carries direction). */
  shares: number;
  /** Volume-weighted fill price in (0,1). */
  price: number;
  /** USD spent (buy) or received (sell). */
  usd: number;
  /** Realized P/L crystallized by this fill (0 for buys). */
  realized_pnl: number;
  created_at: string;
  markets: { question: string } | null;
  market_outcomes: { name: string } | null;
}
