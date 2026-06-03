import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';
import type { Trade } from '@/entities/position';

const TRADE_SELECT =
  'id, position_id, market_id, outcome_id, side, shares, price, usd, realized_pnl, created_at, ' +
  'markets(question), market_outcomes(name)';

/**
 * The user's immutable fill ledger (buys + sells), newest first. Used by the
 * Portfolio "Activity" tab. Invalidated by buy/sell mutations.
 */
export function useTrades() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery<Trade[]>({
    queryKey: ['user', 'trades', userId],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trades')
        .select(TRADE_SELECT)
        .eq('user_id', session!.user.id)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Trade[];
    },
  });
}
