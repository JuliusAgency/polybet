import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface ManagerResetPasswordParams {
  targetUserId: string;
  newPassword: string;
}

export const useManagerResetPassword = () => {
  return useMutation({
    mutationFn: async ({ targetUserId, newPassword }: ManagerResetPasswordParams) => {
      const { error } = await supabase.rpc('manager_reset_password', {
        p_target_user_id: targetUserId,
        p_new_password: newPassword,
      });
      if (error) throw new Error(error.message);
    },
  });
};
