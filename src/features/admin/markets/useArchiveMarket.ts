import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

interface ArchiveMarketParams {
  marketId: string;
}

async function archiveMarket({ marketId }: ArchiveMarketParams): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('markets')
    .update({ status: 'archived', archived_at: now })
    .eq('id', marketId)
    .eq('status', 'resolved');

  if (error) throw new Error(error.message);
}

export function useArchiveMarket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: archiveMarket,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['markets'] });
    },
  });
}
