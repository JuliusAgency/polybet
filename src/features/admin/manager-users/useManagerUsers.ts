import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { DbProfile, DbBalance } from '@/shared/types/database';

export interface UserRow {
  profile: DbProfile;
  balance: DbBalance;
}

const fetchManagerUsers = async (managerId: string): Promise<UserRow[]> => {
  const { data: links, error: linksError } = await supabase
    .from('manager_user_links')
    .select('user_id')
    .eq('manager_id', managerId);

  if (linksError) throw new Error(linksError.message);
  if (!links || links.length === 0) return [];

  const userIds = links.map((l) => l.user_id as string);

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .in('id', userIds);
  if (profilesError) throw new Error(profilesError.message);

  const { data: balances, error: balancesError } = await supabase
    .from('balances')
    .select('*')
    .in('user_id', userIds);
  if (balancesError) throw new Error(balancesError.message);

  const balanceMap = new Map<string, DbBalance>(
    (balances ?? []).map((b) => [b.user_id, b as DbBalance])
  );

  return (profiles as DbProfile[]).map((profile) => ({
    profile,
    balance: balanceMap.get(profile.id) ?? {
      user_id: profile.id,
      available: 0,
      in_play: 0,
      updated_at: '',
    },
  }));
};

export function useManagerUsers(managerId: string) {
  return useQuery({
    queryKey: ['admin', 'manager-users', managerId],
    queryFn: () => fetchManagerUsers(managerId),
    enabled: !!managerId,
  });
}
