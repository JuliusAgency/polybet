import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

// Current user's effective max bet limit (hierarchy: user > manager > global).
// Returns null when no limit applies (0/none) so callers can treat it as unlimited.
export function useMyBetLimit() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery<number | null>({
    queryKey: ['user', 'bet-limit', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_effective_max_bet_limit');
      if (error) throw new Error(error.message);
      return data === null ? null : Number(data);
    },
    enabled: !!session,
    staleTime: 60 * 1000,
  });
}
