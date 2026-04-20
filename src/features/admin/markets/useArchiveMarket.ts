import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  return useMutation({
    mutationFn: archiveMarket,
    onSuccess: () => {
      toast.success(t('markets.archiveSuccess', { defaultValue: 'Market archived' }));
      void queryClient.invalidateQueries({ queryKey: ['markets'] });
    },
    onError: (err: Error) => {
      const message = err.message || t('common.error', { defaultValue: 'Something went wrong' });
      toast.error(
        t('markets.archiveFailed', { defaultValue: 'Failed to archive market' }) + ': ' + message
      );
    },
  });
}
