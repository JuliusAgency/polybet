import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

export function useUnseenBetsCount(): number {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`unseen_bets_count_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bets', filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['user', 'unseen-bets-count', userId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const { data } = useQuery<number>({
    queryKey: ['user', 'unseen-bets-count', userId],
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('bets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['won', 'lost'])
        .is('seen_at', null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: !!userId,
  });

  return data ?? 0;
}
