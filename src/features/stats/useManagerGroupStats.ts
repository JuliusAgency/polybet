import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';
import type { ManagerGroupStats } from '@/shared/types';

const FALLBACK_STATS: ManagerGroupStats = {
  manager_id: '',
  manager_username: '',
  manager_full_name: '',
  group_open_exposure: 0,
  group_pnl: 0,
  group_turnover: 0,
};

export function useManagerGroupStats() {
  const { session } = useAuth();
  const managerId = session?.user.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['manager', 'group-stats', managerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_group_metrics')
        .select('*')
        .eq('manager_id', managerId!)
        .maybeSingle();

      if (error) {
        // Local/dev DB can be behind migrations and miss this view.
        // In that case, keep UI functional with zeros instead of noisy console errors.
        const missingMetricsView =
          error.code === 'PGRST205' ||
          error.code === '42P01' ||
          /manager_group_metrics/i.test(error.message);

        if (missingMetricsView) {
          return {
            ...FALLBACK_STATS,
            manager_id: managerId!,
          } as ManagerGroupStats;
        }

        throw new Error(error.message);
      }
      return (data ?? {
        ...FALLBACK_STATS,
        manager_id: managerId!,
      }) as ManagerGroupStats;
    },
    enabled: !!managerId,
    retry: false,
  });

  return {
    stats: data ?? FALLBACK_STATS,
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
