import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { adminBetLimitSettingsQueryKey } from './useBetLimitSettings';

const adminManagersQueryKey = ['admin', 'managers'] as const;
const adminManagerUsersQueryKey = ['admin', 'manager-users'] as const;

export interface SetGlobalBetLimitParams {
  maxBetLimit: number | null;
}

export function useSetGlobalBetLimit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ maxBetLimit }: SetGlobalBetLimitParams) => {
      const { error } = await supabase.rpc('admin_set_global_max_bet_limit', {
        p_value: maxBetLimit ?? 0,
      });

      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminBetLimitSettingsQueryKey }),
        queryClient.invalidateQueries({ queryKey: adminManagersQueryKey }),
        queryClient.invalidateQueries({ queryKey: adminManagerUsersQueryKey }),
      ]);
    },
  });
}
