import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

interface ArchiveMarketParams {
  marketId: string;
}

async function archiveMarket({ marketId }: ArchiveMarketParams): Promise<void> {
  const { error } = await supabase.rpc('archive_market', {
    p_market_id: marketId,
  });

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
