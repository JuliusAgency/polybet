/**
 * Database types matching the Supabase schema.
 * Tables: profiles, managers, manager_user_links, balances,
 *         markets, market_outcomes, bets, balance_transactions, system_settings, sync_runs
 */

export type MarketStatus = 'open' | 'closed' | 'resolved' | 'archived';
export type BetStatus = 'open' | 'won' | 'lost' | 'cancelled';
export type TransactionType = 'mint' | 'transfer' | 'bet_lock' | 'bet_payout' | 'adjustment';
export type SyncRunStatus = 'running' | 'completed' | 'completed_with_warnings' | 'failed';

export interface DbProfile {
  id: string;
  username: string;
  full_name: string;
  role: 'super_admin' | 'manager' | 'user';
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  cascade_blocked_by: string | null;
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
  polymarket_status_raw: string | null;
  close_at: string | null;
  resolved_at: string | null;
  finalized_at: string | null;
  last_synced_at: string | null;
  source_updated_at: string | null;
  winning_outcome_id: string | null;
  created_at: string;
}

export interface DbMarketOutcome {
  id: string;
  market_id: string;
  polymarket_token_id: string | null;
  name: string;
  price: number | null;
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

export interface DbSyncRun {
  id: string;
  created_by: string | null;
  status: SyncRunStatus;
  phase: string;
  max_pages: number;
  progress_current: number;
  progress_total: number;
  markets_synced: number;
  outcomes_updated: number;
  markets_settled: number;
  errors: string[];
  error_message: string | null;
  created_at: string;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface DbMarketDataDelta {
  id: string;
  market_id: string;
  outcome_id: string | null;
  polymarket_id: string;
  polymarket_token_id: string | null;
  event_type: 'market_created' | 'status_changed' | 'outcome_price_changed' | 'market_resolved';
  old_value: string | null;
  new_value: string | null;
  run_id: string | null;
  changed_at: string;
  created_at: string;
}

export interface SystemKpi {
  total_points_in_system: number;
  open_exposure: number;
  system_profit: number;
  total_payouts_to_winners: number;
  total_stakes_collected: number;
  active_markets: number;
  resolved_markets: number;
  archived_markets: number;
  total_users: number;
  total_managers: number;
}

export interface ManagerGroupStats {
  manager_id: string;
  manager_username: string;
  manager_full_name: string;
  group_open_exposure: number;
  group_pnl: number;
  group_turnover: number;
}

export interface UserStats {
  turnover: number;
  open_exposure: number;
  net_pnl: number;
  win_rate: number;
  settled_bets: number;
}
