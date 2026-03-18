import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { DbProfile, DbManager } from '@/shared/types/database';

export interface ManagerRow {
  profile: DbProfile;
  manager: DbManager;
}

const fetchManagers = async (): Promise<ManagerRow[]> => {
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'manager')
    .order('created_at', { ascending: false });

  if (profilesError) throw new Error(profilesError.message);
  if (!profiles || profiles.length === 0) return [];

  const ids = profiles.map((p) => p.id);

  const { data: managers, error: managersError } = await supabase
    .from('managers')
    .select('*')
    .in('id', ids);

  if (managersError) throw new Error(managersError.message);

  const managerMap = new Map<string, DbManager>(
    (managers ?? []).map((m) => [m.id, m as DbManager])
  );

  return (profiles as DbProfile[]).map((profile) => ({
    profile,
    manager: managerMap.get(profile.id) ?? {
      id: profile.id,
      balance: 0,
      max_bet_limit: null,
      max_win_limit: null,
      margin: 0,
      monthly_stats: {},
    },
  }));
};

export function useManagers() {
  return useQuery({
    queryKey: ['admin', 'managers'],
    queryFn: fetchManagers,
  });
}
