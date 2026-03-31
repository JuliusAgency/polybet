import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { SystemKpi } from '@/shared/types';

const FALLBACK_KPIS: SystemKpi = {
  total_points_in_system: 0,
  open_exposure: 0,
  system_profit: 0,
  total_payouts_to_winners: 0,
  total_collected_from_losers: 0,
  active_markets: 0,
  resolved_markets: 0,
  archived_markets: 0,
  total_users: 0,
  total_managers: 0,
};

export function useSystemKpis() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'system-kpis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_kpis')
        .select('*')
        .single();

      if (error) {
        // Prod/local DB can be behind migrations and miss this view.
        // Keep the dashboard usable with zeros until migrations are applied.
        const missingKpisView =
          error.code === 'PGRST205' ||
          error.code === '42P01' ||
          /system_kpis/i.test(error.message);

        if (missingKpisView) {
          return FALLBACK_KPIS;
        }

        throw new Error(error.message);
      }

      return (data ?? FALLBACK_KPIS) as SystemKpi;
    },
    retry: false,
  });

  useEffect(() => {
    const channel = supabase
      .channel('system_kpis_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'system-kpis'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'balances' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'system-kpis'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'system-kpis'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'system-kpis'] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    kpis: data ?? FALLBACK_KPIS,
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
