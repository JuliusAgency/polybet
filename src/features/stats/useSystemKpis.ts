import { useQuery } from '@tanstack/react-query';
import { supabase, isMissingRelationError } from '@/shared/api/supabase';
import type { SystemKpi } from '@/shared/types';

const KPIS_REFETCH_INTERVAL_MS = 30_000;

const FALLBACK_KPIS: SystemKpi = {
  total_points_in_system: 0,
  open_exposure: 0,
  system_profit: 0,
  total_payouts_to_winners: 0,
  total_stakes_collected: 0,
  active_markets: 0,
  resolved_markets: 0,
  archived_markets: 0,
  total_users: 0,
  total_managers: 0,
};

export function useSystemKpis() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'system-kpis'],
    refetchInterval: KPIS_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase.from('system_kpis').select('*').single();

      if (error) {
        // Prod/local DB can be behind migrations and miss this view.
        // Keep the dashboard usable with zeros until migrations are applied.
        if (isMissingRelationError(error, 'system_kpis')) {
          return FALLBACK_KPIS;
        }

        throw new Error(error.message);
      }

      return (data ?? FALLBACK_KPIS) as SystemKpi;
    },
    retry: false,
  });

  return {
    kpis: data ?? FALLBACK_KPIS,
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
