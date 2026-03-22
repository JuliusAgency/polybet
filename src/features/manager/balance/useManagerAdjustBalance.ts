import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface ManagerAdjustBalanceParams {
  targetUserId: string;
  amount: number;
  type: 'deposit' | 'withdrawal';
  note: string;
}

export const useManagerAdjustBalance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetUserId, amount, type, note }: ManagerAdjustBalanceParams) => {
      const { error } = await supabase.rpc('manager_adjust_balance', {
        p_target_user_id: targetUserId,
        p_amount: amount,
        p_type: type,
        p_note: note,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['manager', 'balance-transactions'] });
    },
  });
};
