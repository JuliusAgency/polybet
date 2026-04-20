import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

interface ToggleFavoriteInput {
  marketId: string;
  isFavorite: boolean;
}

export function useToggleFavoriteMarket() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const queryKey = ['user', 'favorite-markets', userId] as const;

  return useMutation({
    mutationFn: async ({ marketId, isFavorite }: ToggleFavoriteInput) => {
      if (!session) throw new Error('Not authenticated');

      if (isFavorite) {
        const { error } = await supabase
          .from('user_favorite_markets')
          .delete()
          .eq('user_id', session.user.id)
          .eq('market_id', marketId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from('user_favorite_markets')
          .insert({ user_id: session.user.id, market_id: marketId });
        if (error) throw new Error(error.message);
      }
    },
    // Optimistic: flip the cache immediately, roll back on failure.
    onMutate: async ({ marketId, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<string[]>(queryKey) ?? [];
      const next = isFavorite
        ? previous.filter((id) => id !== marketId)
        : [...previous, marketId];
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
