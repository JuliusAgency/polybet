/**
 * Database types matching the Supabase schema.
 * Tables: profiles, managers, manager_user_links, balances,
 *         markets, market_outcomes, bets, balance_transactions, system_settings
 */

export type MarketStatus = 'open' | 'closed' | 'resolved';
export type BetStatus = 'open' | 'won' | 'lost' | 'cancelled';
export type TransactionType = 'mint' | 'transfer' | 'bet_lock' | 'bet_payout' | 'adjustment';

export interface DbProfile {
  id: string;
  username: string;
  full_name: string;
  role: 'super_admin' | 'manager' | 'user';
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface DbManager {
  id: string;
  balance: number;
  max_bet_limit: number | null;
  max_win_limit: number | null;
  margin: number;
  monthly_stats: Record<string, unknown>;
}

export interface DbManagerUserLink {
  manager_id: string;
  user_id: string;
}

export interface DbBalance {
  user_id: string;
  available: number;
  in_play: number;
  updated_at: string;
}

export interface DbMarket {
  id: string;
  polymarket_id: string;
  question: string;
  category: string | null;
  status: MarketStatus;
  close_at: string | null;
  resolved_at: string | null;
  winning_outcome_id: string | null;
  created_at: string;
}

export interface DbMarketOutcome {
  id: string;
  market_id: string;
  name: string;
  odds: number;
  effective_odds: number;
  updated_at: string;
}

export interface DbBet {
  id: string;
  user_id: string;
  market_id: string;
  outcome_id: string;
  stake: number;
  locked_odds: number; // зафиксированы в момент ставки — никогда не меняются
  potential_payout: number;
  status: BetStatus;
  placed_at: string;
  settled_at: string | null;
}

export interface DbBalanceTransaction {
  id: string;
  user_id: string;
  initiated_by: string;
  type: TransactionType;
  amount: number;
  balance_after: number;
  bet_id: string | null;
  note: string | null;
  created_at: string;
}

export interface DbSystemSetting {
  key: string;
  value: unknown;
}
