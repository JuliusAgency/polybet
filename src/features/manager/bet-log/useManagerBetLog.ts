import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { BetStatus, BetLogRow } from '@/features/admin/bet-log';

interface ManagerBetLogFilters {
  userId?: string;
  status?: BetStatus;
}

interface UseManagerBetLogResult {
  rows: BetLogRow[];
  isLoading: boolean;
  error: Error | null;
}

const fetchManagerBetLog = async (filters: ManagerBetLogFilters): Promise<BetLogRow[]> => {
  let query = supabase
    .from('admin_bet_log')
    .select('*')
    .order('placed_at', { ascending: false });

  if (filters.userId) {
    query = query.eq('user_id', filters.userId);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data ?? []) as BetLogRow[];
};

export function useManagerBetLog(filters: ManagerBetLogFilters = {}): UseManagerBetLogResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['manager', 'bet-log', { userId: filters.userId, status: filters.status }],
    queryFn: () => fetchManagerBetLog(filters),
  });

  return {
    rows: data ?? [],
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
