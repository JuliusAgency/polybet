import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSupabaseFunction } from '@/shared/api/supabase';
import { parseSyncStartResponse, type SyncStartResponse } from './syncStartResponse';

interface StartSyncParams {
  maxPages: number;
  runId: string;
}

export function useSyncMarkets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ maxPages, runId }: StartSyncParams): Promise<SyncStartResponse> => {
      const { data, error } = await invokeSupabaseFunction<SyncStartResponse>(
        `sync-polymarket-markets?max_pages=${maxPages}`,
        {
          body: { run_id: runId },
        },
      );
      if (error) {
        const functionError = error as { message?: string };
        throw new Error(functionError.message ?? 'Function invocation failed');
      }
      return parseSyncStartResponse(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sync-run'] });
    },
  });
}
