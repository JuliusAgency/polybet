import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

export interface UserTransaction {
  id: string;
  created_at: string;
  type: 'mint' | 'transfer' | 'bet_lock' | 'bet_payout' | 'adjustment';
  amount: number;
  balance_after: number;
  bet_id: string | null;
  note: string | null;
}

export interface UseUserTransactionsParams {
  startDate?: string; // ISO date string, e.g. "2026-01-01"
  endDate?: string;   // ISO date string, e.g. "2026-12-31"
}

export function useUserTransactions({ startDate, endDate }: UseUserTransactionsParams = {}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  const result = useQuery<UserTransaction[]>({
    queryKey: ['user', 'transactions', userId, startDate, endDate],
    queryFn: async () => {
      if (!session) return [];

      let query = supabase
        .from('balance_transactions')
        .select('id, created_at, type, amount, balance_after, bet_id, note')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        // Include the full end date by going to the start of the next day
        const nextDay = new Date(endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        query = query.lt('created_at', nextDay.toISOString());
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as UserTransaction[];
    },
    enabled: !!session,
  });

  // Invalidate all date-range variants for this user on any new transaction insert
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user_transactions_inserts_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'balance_transactions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['user', 'transactions', userId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return result;
}
