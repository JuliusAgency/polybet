import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

interface FavoriteMarketRow {
  market_id: string;
}

export function useFavoriteMarkets() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const query = useQuery<string[]>({
    queryKey: ['user', 'favorite-markets', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_favorite_markets')
        .select('market_id')
        .eq('user_id', session!.user.id);

      if (error) throw new Error(error.message);
      return (data as FavoriteMarketRow[]).map((r) => r.market_id);
    },
    enabled: !!session,
    staleTime: 30_000,
  });

  const favoriteSet = useMemo(() => new Set(query.data ?? []), [query.data]);

  return { favoriteSet, isLoading: query.isLoading };
}
