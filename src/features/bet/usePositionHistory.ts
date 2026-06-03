import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';
import type { Position } from '@/entities/position';

const POSITION_SELECT =
  'id, market_id, outcome_id, shares, avg_price, cost_basis, realized_pnl, status, opened_at, updated_at, settled_at, ' +
  'markets(question, status, winning_outcome_id, last_synced_at, event_id), ' +
  'market_outcomes(name, polymarket_token_id, price)';

/**
 * The user's CLOSED positions — settled (won/lost) or fully sold out (closed).
 * These are terminal, so no polling; invalidated by sell/settlement flows.
 */
export function usePositionHistory() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery<Position[]>({
    queryKey: ['user', 'position-history', userId],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('positions')
        .select(POSITION_SELECT)
        .eq('user_id', session!.user.id)
        .in('status', ['closed', 'won', 'lost'])
        .order('updated_at', { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Position[];
    },
  });
}
