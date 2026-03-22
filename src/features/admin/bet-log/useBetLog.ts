import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export type BetStatus = 'open' | 'won' | 'lost' | 'cancelled';

export interface BetLogRow {
  id: string;
  placed_at: string;
  settled_at: string | null;
  stake: number;
  locked_odds: number;
  potential_payout: number;
  status: BetStatus;
  user_id: string;
  user_username: string;
  user_full_name: string;
  manager_id: string | null;
  manager_username: string | null;
  manager_full_name: string | null;
  market_description: string;
  outcome_name: string;
}

interface BetLogFilters {
  managerId?: string;
  status?: BetStatus;
}

interface UseBetLogResult {
  rows: BetLogRow[];
  isLoading: boolean;
  error: Error | null;
}

const fetchBetLog = async (filters: BetLogFilters): Promise<BetLogRow[]> => {
  let query = supabase
    .from('admin_bet_log')
    .select('*')
    .order('placed_at', { ascending: false });

  if (filters.managerId) {
    query = query.eq('manager_id', filters.managerId);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data ?? []) as BetLogRow[];
};

export function useBetLog(filters: BetLogFilters = {}): UseBetLogResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'bet-log', { managerId: filters.managerId, status: filters.status }],
    queryFn: () => fetchBetLog(filters),
  });

  return {
    rows: data ?? [],
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
