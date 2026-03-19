import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface TransactionFilters {
  managerId?: string;
  month?: number;  // 1-12
  year?: number;   // e.g. 2026
}

export interface FinancialTransactionRow {
  id: string;
  created_at: string;
  type: 'adjustment' | 'transfer';
  amount: number;
  balance_after: number;
  note: string | null;
  user_id: string;
  user_username: string;
  user_full_name: string;
  initiated_by: string;
  manager_username: string;
  manager_full_name: string;
  initiator_role: string;
  total_profit_calc: number; // computed: running cumulative net profit (oldest→newest)
}

export interface TransactionTotals {
  totalDeposits: number;
  totalWithdrawals: number;
  netProfit: number;
}

interface UseFinancialTransactionsResult {
  transactions: FinancialTransactionRow[];
  totals: TransactionTotals;
  isLoading: boolean;
  error: Error | null;
}

const fetchFinancialTransactions = async (
  filters: TransactionFilters,
): Promise<FinancialTransactionRow[]> => {
  let query = supabase
    .from('admin_financial_transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.managerId) {
    query = query.eq('initiated_by', filters.managerId);
  }

  if (filters.year !== undefined && filters.month !== undefined) {
    const month = filters.month;
    const year = filters.year;
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 1).toISOString();
    query = query.gte('created_at', startDate).lt('created_at', endDate);
  } else if (filters.year !== undefined) {
    const startDate = new Date(filters.year, 0, 1).toISOString();
    const endDate = new Date(filters.year + 1, 0, 1).toISOString();
    query = query.gte('created_at', startDate).lt('created_at', endDate);
  } else if (filters.month !== undefined) {
    const now = new Date();
    const year = now.getFullYear();
    const month = filters.month;
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 1).toISOString();
    query = query.gte('created_at', startDate).lt('created_at', endDate);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  // Rows arrive newest-first from DB. Compute running total oldest→newest, then reverse back.
  const raw = (data ?? []) as Omit<FinancialTransactionRow, 'total_profit_calc'>[];
  const ascending = [...raw].reverse();
  let running = 0;
  const withRunningTotal: FinancialTransactionRow[] = ascending.map((tx) => {
    running += tx.amount; // amount is already signed: adjustment=positive, transfer=negative
    return { ...tx, total_profit_calc: running };
  });
  return withRunningTotal.reverse(); // back to newest-first for display
};

const computeTotals = (transactions: FinancialTransactionRow[]): TransactionTotals => {
  let totalDeposits = 0;
  let totalWithdrawals = 0;

  for (const tx of transactions) {
    if (tx.type === 'adjustment') {
      totalDeposits += tx.amount;
    } else if (tx.type === 'transfer') {
      totalWithdrawals += Math.abs(tx.amount);
    }
  }

  return {
    totalDeposits,
    totalWithdrawals,
    netProfit: totalDeposits - totalWithdrawals,
  };
};

export function useFinancialTransactions(
  filters: TransactionFilters = {},
): UseFinancialTransactionsResult {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'financial-transactions', filters.managerId, filters.month, filters.year],
    queryFn: () => fetchFinancialTransactions(filters),
  });

  useEffect(() => {
    const channel = supabase
      .channel('balance_transactions_inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'balance_transactions' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['admin', 'financial-transactions'] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const transactions = data ?? [];
  const totals = computeTotals(transactions);

  return {
    transactions,
    totals,
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
