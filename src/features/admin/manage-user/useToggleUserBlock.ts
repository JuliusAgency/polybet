import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface ToggleUserBlockParams {
  targetUserId: string;
}

export const useToggleUserBlock = () => {
  return useMutation({
    mutationFn: async ({ targetUserId }: ToggleUserBlockParams) => {
      const { error } = await supabase.rpc('admin_toggle_user_block', {
        p_target_user_id: targetUserId,
      });
      if (error) throw new Error(error.message);
    },
  });
};
