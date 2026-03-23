import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSupabaseFunction } from '@/shared/api/supabase';

export interface SyncResult {
  run_id: string;
  success: boolean;
  markets_synced: number;
  markets_settled: number;
  errors: string[];
}

interface StartSyncParams {
  maxPages: number;
  runId: string;
}

export function useSyncMarkets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ maxPages, runId }: StartSyncParams): Promise<SyncResult> => {
      const { data, error } = await invokeSupabaseFunction<SyncResult>(
        `sync-polymarket-markets?max_pages=${maxPages}`,
        {
          body: { run_id: runId },
        },
      );
      if (error) {
        const functionError = error as { message?: string };
        throw new Error(functionError.message ?? 'Function invocation failed');
      }
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'sync-run'] });
    },
  });
}
