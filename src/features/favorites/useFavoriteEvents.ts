import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

interface FavoriteEventRow {
  event_id: string;
}

export function useFavoriteEvents() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const query = useQuery<string[]>({
    queryKey: ['user', 'favorite-events', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_favorite_events')
        .select('event_id')
        .eq('user_id', session!.user.id);

      if (error) throw new Error(error.message);
      return (data as FavoriteEventRow[]).map((r) => r.event_id);
    },
    enabled: !!session,
    staleTime: 30_000,
  });

  const favoriteEventSet = useMemo(() => new Set(query.data ?? []), [query.data]);

  return { favoriteEventSet, isLoading: query.isLoading };
}
