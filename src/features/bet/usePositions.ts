import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';
import type { Position } from '@/entities/position';
import { MARKETS_REFRESH_INTERVAL_MS } from '@/shared/config/markets';

const POSITION_SELECT =
  'id, market_id, outcome_id, shares, avg_price, cost_basis, realized_pnl, status, opened_at, updated_at, settled_at, ' +
  'markets(question, status, winning_outcome_id, last_synced_at, event_id), ' +
  'market_outcomes(name, polymarket_token_id, price)';

/**
 * The user's OPEN positions (the portfolio). Polled on the markets-refresh
 * cadence so settlement and price marks stay fresh without realtime — positions
 * is intentionally NOT in the realtime publication (high-write, see CLAUDE.md);
 * buy/sell mutations also invalidate ['user','positions'] for instant feedback.
 */
export function usePositions() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery<Position[]>({
    queryKey: ['user', 'positions', userId],
    enabled: !!session,
    refetchInterval: MARKETS_REFRESH_INTERVAL_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('positions')
        .select(POSITION_SELECT)
        .eq('user_id', session!.user.id)
        .eq('status', 'open')
        .order('opened_at', { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Position[];
    },
  });
}
