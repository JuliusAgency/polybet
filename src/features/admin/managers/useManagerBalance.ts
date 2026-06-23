import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export const managerBalanceQueryKey = (managerId: string) => [
  'admin',
  'manager-balance',
  managerId,
];

const fetchManagerBalance = async (managerId: string): Promise<number> => {
  const { data, error } = await supabase
    .from('managers')
    .select('balance')
    .eq('id', managerId)
    .single();
  if (error) throw new Error(error.message);
  return (data as { balance: number }).balance;
};

/** A manager's house balance (the `managers.balance` ledger column). */
export function useManagerBalance(managerId: string) {
  return useQuery({
    queryKey: managerBalanceQueryKey(managerId),
    queryFn: () => fetchManagerBalance(managerId),
    enabled: !!managerId,
  });
}
