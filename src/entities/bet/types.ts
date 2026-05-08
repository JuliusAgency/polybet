export interface MyBet {
  id: string;
  market_id: string;
  outcome_id: string;
  stake: number;
  locked_odds: number;
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
