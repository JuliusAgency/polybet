import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { DbSyncRun } from '@/shared/types/database';

export function useSyncRun(runId: string | null) {
  return useQuery({
    queryKey: ['admin', 'sync-run', runId],
    enabled: !!runId,
    queryFn: async (): Promise<DbSyncRun | null> => {
      const { data, error } = await supabase
        .from('sync_runs')
        .select(
          'id, created_by, status, phase, max_pages, progress_current, progress_total, markets_synced, outcomes_updated, markets_settled, errors, error_message, created_at, started_at, updated_at, finished_at',
        )
        .eq('id', runId!)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        return null;
      }

      return {
        ...(data as Omit<DbSyncRun, 'errors'>),
        errors: Array.isArray(data.errors) ? (data.errors as string[]) : [],
      };
    },
    refetchInterval: (query) => {
      const current = query.state.data;
      if (!runId) return false;
      return current?.status === 'completed' || current?.status === 'completed_with_warnings' || current?.status === 'failed'
        ? false
        : 1000;
    },
  });
}
