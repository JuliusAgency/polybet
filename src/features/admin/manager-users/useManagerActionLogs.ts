import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface ManagerActionLogRow {
  id: string;
  created_at: string;
  action: string;
  amount: number | null;
  note: string | null;
  target_id: string;
  target_username: string;
  target_full_name: string;
  initiated_by: string;
  initiator_username: string;
  initiator_role: string;
}

export function useManagerActionLogs(targetIds: string[]) {
  return useQuery({
    queryKey: ['admin', 'action-logs', targetIds],
    queryFn: async (): Promise<ManagerActionLogRow[]> => {
      if (targetIds.length === 0) return [];
      const { data, error } = await supabase
        .from('admin_combined_action_logs')
        .select('*')
        .in('target_id', targetIds)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as ManagerActionLogRow[];
    },
    enabled: targetIds.length > 0,
  });
}
