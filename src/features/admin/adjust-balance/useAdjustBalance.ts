import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface AdjustBalanceParams {
  targetUserId: string;
  amount: number;
  type: 'deposit' | 'withdrawal';
  note: string;
}

export const useAdjustBalance = () => {
  return useMutation({
    mutationFn: async ({ targetUserId, amount, type, note }: AdjustBalanceParams) => {
      const { error } = await supabase.rpc('admin_adjust_balance', {
        p_target_user_id: targetUserId,
        p_amount: amount,
        p_type: type,
        p_note: note,
      });
      if (error) throw new Error(error.message);
    },
  });
};
