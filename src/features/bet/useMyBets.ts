import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

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

export function useMyBets() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;

    // Single channel that listens to:
    // 1. bets table — direct bet status changes (e.g. won/lost after settlement)
    // 2. markets table — market resolution changes the joined markets data in the query
    const channel = supabase
      .channel(`user_bets_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bets', filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['user', 'bets', userId] });
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'markets' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['user', 'bets', userId] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return useQuery<MyBet[]>({
    // Include user id in key to prevent cross-user cache collisions on session switch
    queryKey: ['user', 'bets', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bets')
        .select(
          'id, market_id, outcome_id, stake, locked_odds, potential_payout, status, placed_at, settled_at, seen_at, markets(question, status, winning_outcome_id, last_synced_at, event_id), market_outcomes(name)'
        )
        // Defense-in-depth: RLS enforces this, but explicit filter documents intent
        .eq('user_id', session!.user.id)
        .order('placed_at', { ascending: false });

      if (error) throw new Error(error.message);
      // Supabase infers joined relations as arrays; cast via unknown matches runtime shape
      return (data ?? []) as unknown as MyBet[];
    },
    enabled: !!session,
  });
}
