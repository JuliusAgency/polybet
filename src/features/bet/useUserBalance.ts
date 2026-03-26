import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

export interface UserBalance {
  available: number;
  in_play: number;
}

export function useUserBalance() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user_balance_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'balances', filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['user', 'balance', userId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return useQuery<UserBalance | null>({
    // Include user id to prevent cross-user cache collisions on session switch
    queryKey: ['user', 'balance', userId],
    queryFn: async () => {
      if (!session) return null;

      const { data, error } = await supabase
        .from('balances')
        .select('available, in_play')
        .eq('user_id', session.user.id)
        .single();

      if (error) throw new Error(error.message);
      return data as UserBalance;
    },
    enabled: !!session,
  });
}
