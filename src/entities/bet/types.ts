export interface MyBet {
  id: string;
  market_id: string;
  outcome_id: string;
  stake: number;
  /** Number of $1 shares acquired (gross payout on win). */
  shares: number;
  /** Volume-weighted average fill price in (0,1). Cents = round(avg_price*100). */
  avg_price: number;
  /** @deprecated legacy odds multiplier (= shares/stake). Prefer shares/avg_price. */
  locked_odds: number;
  /** @deprecated mirrors `shares` (each share pays $1). Prefer shares. */
  potential_payout: number;
  status: 'open' | 'won' | 'lost' | 'cancelled';
  placed_at: string;
  settled_at: string | null;
  seen_at: string | null;
  markets: {
    question: string;
    status: 'open' | 'closed' | 'resolved' | 'archived';
    winning_outcome_id: string | null;
    last_synced_at: string | null;
    event_id: string | null;
  } | null;
  market_outcomes: { name: string } | null;
}

// Alias so a future rename is non-breaking
export type Bet = MyBet;
