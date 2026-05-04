import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface PlaceBetInput {
  marketId: string;
  outcomeId: string;
  stake: number;
}

export function usePlaceBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: PlaceBetInput): Promise<string> => {
      const { data: betId, error } = await supabase.rpc('place_bet', {
        p_market_id: vars.marketId,
        p_outcome_id: vars.outcomeId,
        p_stake: vars.stake,
      });

      if (error) throw new Error(error.message);
      return betId as string;
    },
    onSuccess: () => {
      // Balance update is not covered by realtime, so must be invalidated explicitly.
      // Bets list is covered by the useMyBets realtime channel (INSERT on bets fires it).
      queryClient.invalidateQueries({ queryKey: ['user', 'balance'] });
    },
  });
}
