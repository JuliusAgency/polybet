import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface UserRow {
  user_id: string;
  profiles: { id: string; full_name: string; username: string; is_active: boolean } | null;
  balances: { available: number; in_play: number } | null;
}

export function useMyUsers() {
  return useQuery({
    queryKey: ['manager', 'users'],
    queryFn: async (): Promise<UserRow[]> => {
      // Step 1: fetch linked users with profiles (direct FK exists)
      const { data: links, error } = await supabase
        .from('manager_user_links')
        .select('user_id, profiles!manager_user_links_user_id_fkey(id, full_name, username, is_active)');

      if (error) throw new Error(error.message);
      if (!links || links.length === 0) return [];

      // Step 2: fetch balances separately — no direct FK from manager_user_links to balances
      const userIds = links.map((l) => l.user_id);
      const { data: balances, error: balError } = await supabase
        .from('balances')
        .select('user_id, available, in_play')
        .in('user_id', userIds);

      if (balError) throw new Error(balError.message);

      const balanceMap = new Map((balances ?? []).map((b) => [b.user_id, b]));

      return links.map((l) => ({
        user_id: l.user_id,
        profiles: l.profiles as UserRow['profiles'],
        balances: balanceMap.get(l.user_id) ?? null,
      }));
    },
  });
}
