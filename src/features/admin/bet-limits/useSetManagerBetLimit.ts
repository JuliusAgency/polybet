import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { adminBetLimitSettingsQueryKey } from './useBetLimitSettings';
import { allLimitsQueryKey } from './useAllLimitsData';

const adminManagersQueryKey = ['admin', 'managers'] as const;
const adminManagerUsersQueryKey = ['admin', 'manager-users'] as const;

export interface SetManagerBetLimitParams {
  managerId: string;
  maxBetLimit: number | null;
}

export function useSetManagerBetLimit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ managerId, maxBetLimit }: SetManagerBetLimitParams) => {
      const { error } = await supabase.rpc('admin_set_manager_max_bet_limit', {
        p_manager_id: managerId,
        p_value: maxBetLimit ?? 0,
      });

      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminBetLimitSettingsQueryKey }),
        queryClient.invalidateQueries({ queryKey: adminManagersQueryKey }),
        queryClient.invalidateQueries({ queryKey: adminManagerUsersQueryKey }),
        queryClient.invalidateQueries({ queryKey: allLimitsQueryKey }),
      ]);
    },
  });
}
