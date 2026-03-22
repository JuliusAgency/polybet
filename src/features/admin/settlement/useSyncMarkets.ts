import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

interface SyncResult {
  markets_synced: number;
  markets_settled: number;
  errors: string[];
}

export function useSyncMarkets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      // max_pages=1 limits to ~100 active + 50 resolved markets per manual sync
      // to avoid hitting Edge Function CPU/memory limits
      const { data, error } = await supabase.functions.invoke('sync-polymarket-markets?max_pages=1');
      if (error) throw new Error(error.message);
      if (!data) throw new Error('No response from sync function');
      // Validate expected shape before returning
      if (typeof data.markets_synced !== 'number' || typeof data.markets_settled !== 'number') {
        throw new Error('Unexpected response shape from sync function');
      }
      return data as SyncResult;
    },
    onSuccess: () => {
      // Refresh markets and bet log after sync
      queryClient.invalidateQueries({ queryKey: ['markets'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'bet-log'] });
    },
  });
}
