import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

export interface UserBalance {
  available: number;
  in_play: number;
}

export function useUserBalance() {
  const { session } = useAuth();

  return useQuery<UserBalance | null>({
    // Include user id to prevent cross-user cache collisions on session switch
    queryKey: ['user', 'balance', session?.user.id],
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
