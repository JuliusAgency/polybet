import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

interface ManagerToggleUserBlockParams {
  targetUserId: string;
}

export const useManagerToggleUserBlock = () => {
  return useMutation({
    mutationFn: async ({ targetUserId }: ManagerToggleUserBlockParams) => {
      const { error } = await supabase.rpc('manager_toggle_user_block', {
        p_target_user_id: targetUserId,
      });

      if (error) throw new Error(error.message);
    },
  });
};
