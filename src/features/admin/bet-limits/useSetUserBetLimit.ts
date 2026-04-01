import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { adminBetLimitSettingsQueryKey } from './useBetLimitSettings';
import { allLimitsQueryKey } from './useAllLimitsData';

const adminManagerUsersQueryKey = ['admin', 'manager-users'] as const;

export interface SetUserBetLimitParams {
  userId: string;
  maxBetLimit: number | null;
}

export function useSetUserBetLimit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, maxBetLimit }: SetUserBetLimitParams) => {
      const { error } = await supabase.rpc('admin_set_user_max_bet_limit', {
        p_user_id: userId,
        p_value: maxBetLimit ?? 0,
      });

      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminBetLimitSettingsQueryKey }),
        queryClient.invalidateQueries({ queryKey: adminManagerUsersQueryKey }),
        queryClient.invalidateQueries({ queryKey: allLimitsQueryKey }),
      ]);
    },
  });
}
