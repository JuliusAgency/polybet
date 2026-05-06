import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

interface FavoriteMarketRow {
  market_id: string;
  markets: { event_id: string | null } | null;
}

interface FavoriteMarketEntry {
  marketId: string;
  eventId: string | null;
}

export function useFavoriteMarkets() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const query = useQuery<FavoriteMarketEntry[]>({
    queryKey: ['user', 'favorite-markets', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_favorite_markets')
        .select('market_id, markets(event_id)')
        .eq('user_id', session!.user.id);

      if (error) throw new Error(error.message);
      return (data as unknown as FavoriteMarketRow[]).map((r) => ({
        marketId: r.market_id,
        eventId: r.markets?.event_id ?? null,
      }));
    },
    enabled: !!session,
    staleTime: 30_000,
  });

  const favoriteSet = useMemo(
    () => new Set((query.data ?? []).map((e) => e.marketId)),
    [query.data]
  );

  // Map<eventId, count of favorited markets in that event>. Standalone
  // markets (event_id === null) are excluded — they don't aggregate to an
  // event-level state.
  const favoritesByEvent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of query.data ?? []) {
      if (!entry.eventId) continue;
      counts.set(entry.eventId, (counts.get(entry.eventId) ?? 0) + 1);
    }
    return counts;
  }, [query.data]);

  return { favoriteSet, favoritesByEvent, isLoading: query.isLoading };
}
