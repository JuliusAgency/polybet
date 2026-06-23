import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { DbProfile } from '@/shared/types/database';

export const managerProfileQueryKey = (managerId: string) => ['admin', 'manager', managerId];

const fetchManagerProfile = async (managerId: string): Promise<DbProfile | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', managerId)
    .eq('role', 'manager')
    .single();
  if (error) throw new Error(error.message);
  return data as DbProfile;
};

/** A single manager's profile row (role-gated to managers). */
export function useManagerProfile(managerId: string) {
  return useQuery({
    queryKey: managerProfileQueryKey(managerId),
    queryFn: () => fetchManagerProfile(managerId),
    enabled: !!managerId,
  });
}
