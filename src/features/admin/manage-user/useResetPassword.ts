import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface ResetPasswordParams {
  targetUserId: string;
  newPassword: string;
}

export const useResetPassword = () => {
  return useMutation({
    mutationFn: async ({ targetUserId, newPassword }: ResetPasswordParams) => {
      const { error } = await supabase.rpc('admin_reset_password', {
        p_target_user_id: targetUserId,
        p_new_password: newPassword,
      });
      if (error) throw new Error(error.message);
    },
  });
};
