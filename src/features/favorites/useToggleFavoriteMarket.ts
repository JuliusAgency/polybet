import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

interface FavoriteMarketEntry {
  marketId: string;
  eventId: string | null;
}

interface ToggleFavoriteInput {
  marketId: string;
  /** True when the market is currently a favourite (so the action will REMOVE it). */
  currentlyFavorite: boolean;
  /**
   * Event id of the market, when known by the caller. Used purely to keep
   * the optimistic cache update aligned with the server shape — without it
   * the partial/full event-bookmark state would only update after refetch.
   */
  eventId?: string | null;
}

export function useToggleFavoriteMarket() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const queryKey = ['user', 'favorite-markets', userId] as const;

  return useMutation({
    mutationFn: async ({ marketId, currentlyFavorite }: ToggleFavoriteInput) => {
      if (!session) throw new Error('Not authenticated');

      if (currentlyFavorite) {
        const { error } = await supabase
          .from('user_favorite_markets')
          .delete()
          .eq('user_id', session.user.id)
          .eq('market_id', marketId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from('user_favorite_markets')
          .upsert(
            { user_id: session.user.id, market_id: marketId },
            { onConflict: 'user_id,market_id', ignoreDuplicates: true }
          );
        if (error) throw new Error(error.message);
      }
    },
    onMutate: async ({ marketId, currentlyFavorite, eventId }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<FavoriteMarketEntry[]>(queryKey) ?? [];
      const next: FavoriteMarketEntry[] = currentlyFavorite
        ? previous.filter((e) => e.marketId !== marketId)
        : previous.some((e) => e.marketId === marketId)
          ? previous
          : [...previous, { marketId, eventId: eventId ?? null }];
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
