import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface AdjustManagerBalanceParams {
  managerId: string;
  amount: number;
  type: 'deposit' | 'withdrawal';
  note: string;
}

export const useAdjustManagerBalance = () => {
  return useMutation({
    mutationFn: async ({ managerId, amount, type, note }: AdjustManagerBalanceParams) => {
      const { error } = await supabase.rpc('admin_adjust_manager_balance', {
        p_manager_id: managerId,
        p_amount: amount,
        p_type: type,
        p_note: note,
      });
      if (error) throw new Error(error.message);
    },
  });
};
