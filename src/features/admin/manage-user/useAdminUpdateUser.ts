import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface AdminUpdateUserParams {
  targetUserId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export const useAdminUpdateUser = () => {
  return useMutation({
    mutationFn: async ({ targetUserId, firstName, lastName, phone }: AdminUpdateUserParams) => {
      const { error } = await supabase.rpc('admin_update_user', {
        p_target_user_id: targetUserId,
        p_first_name: firstName,
        p_last_name: lastName,
        p_phone: phone,
      });
      if (error) throw new Error(error.message);
    },
  });
};
