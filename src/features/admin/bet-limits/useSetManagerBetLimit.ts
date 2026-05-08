import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { invalidateAllBetLimitCaches } from './invalidations';

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
      await invalidateAllBetLimitCaches(queryClient, 'manager');
    },
  });
}
