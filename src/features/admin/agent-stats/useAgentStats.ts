import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface AgentStatsRow {
  agent_id: string;
  username: string;
  full_name: string;
  is_active: boolean;
  monthly_deposits: number;
  monthly_withdrawals: number;
  current_system_balance: number;
  monthly_pnl: number;
}

interface AgentStatsFilters {
  month?: number; // 1-12
  year?: number;
}

interface UseAgentStatsResult {
  agents: AgentStatsRow[];
  isLoading: boolean;
  error: Error | null;
}

export function useAgentStats(filters: AgentStatsFilters = {}): UseAgentStatsResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'agent-stats', filters.month, filters.year],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_agent_stats', {
        p_month: filters.month ?? null,
        p_year: filters.year ?? null,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AgentStatsRow[];
    },
    refetchInterval: 30_000,
  });

  return {
    agents: data ?? [],
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
