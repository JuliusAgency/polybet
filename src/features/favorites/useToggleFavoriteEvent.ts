import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

interface ToggleFavoriteEventInput {
  eventId: string;
  /** True when the event is currently saved (so the action will REMOVE it). */
  currentlyFavorite: boolean;
}

export function useToggleFavoriteEvent() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const queryKey = ['user', 'favorite-events', userId] as const;
  const marketsQueryKey = ['user', 'favorite-markets', userId] as const;

  return useMutation({
    mutationFn: async ({ eventId, currentlyFavorite }: ToggleFavoriteEventInput) => {
      if (!session) throw new Error('Not authenticated');

      if (currentlyFavorite) {
        const { error } = await supabase
          .from('user_favorite_events')
          .delete()
          .eq('user_id', session.user.id)
          .eq('event_id', eventId);
        if (error) throw new Error(error.message);

        // Bug 5: when removing an event from Saved, also drop any individual
        // market favourites that belong to that event. Otherwise those child
        // rows keep the markets visible in the Saved view and the user
        // perceives "delete didn't work". Two-step delete because the JS
        // client doesn't support `DELETE … WHERE market_id IN (subquery)`.
        const { data: childMarkets, error: childErr } = await supabase
          .from('markets')
          .select('id')
          .eq('event_id', eventId);
        if (childErr) throw new Error(childErr.message);
        const childIds = (childMarkets ?? []).map((m) => m.id as string);
        if (childIds.length > 0) {
          const { error: delErr } = await supabase
            .from('user_favorite_markets')
            .delete()
            .eq('user_id', session.user.id)
            .in('market_id', childIds);
          if (delErr) throw new Error(delErr.message);
        }
      } else {
        const { error } = await supabase
          .from('user_favorite_events')
          .upsert(
            { user_id: session.user.id, event_id: eventId },
            { onConflict: 'user_id,event_id', ignoreDuplicates: true }
          );
        if (error) throw new Error(error.message);
      }
    },
    onMutate: async ({ eventId, currentlyFavorite }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<string[]>(queryKey) ?? [];
      const next = currentlyFavorite
        ? previous.filter((id) => id !== eventId)
        : Array.from(new Set([...previous, eventId]));
      queryClient.setQueryData(queryKey, next);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      // Cascade-delete may have removed rows from user_favorite_markets too.
      void queryClient.invalidateQueries({ queryKey: marketsQueryKey });
    },
  });
}
