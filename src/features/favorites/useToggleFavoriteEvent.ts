import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

interface ToggleFavoriteEventInput {
  marketIds: string[];
  mode: 'add' | 'remove';
}

export function useToggleFavoriteEvent() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const queryKey = ['user', 'favorite-markets', userId] as const;

  return useMutation({
    mutationFn: async ({ marketIds, mode }: ToggleFavoriteEventInput) => {
      if (!session) throw new Error('Not authenticated');

      if (mode === 'add') {
        const rows = marketIds.map((market_id) => ({
          user_id: session.user.id,
          market_id,
        }));
        const { error } = await supabase
          .from('user_favorite_markets')
          .upsert(rows, { onConflict: 'user_id,market_id', ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from('user_favorite_markets')
          .delete()
          .eq('user_id', session.user.id)
          .in('market_id', marketIds);
        if (error) throw new Error(error.message);
      }
    },
    onMutate: async ({ marketIds, mode }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<string[]>(queryKey) ?? [];
      const next =
        mode === 'add'
          ? Array.from(new Set([...previous, ...marketIds]))
          : previous.filter((id) => !marketIds.includes(id));
      queryClient.setQueryData(queryKey, next);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}
