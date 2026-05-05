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
    },
  });
}
