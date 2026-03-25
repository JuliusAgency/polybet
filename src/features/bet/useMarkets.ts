import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface MarketOutcome {
  id: string;
  name: string;
  odds: number;
  effective_odds: number;
}

export interface Market {
  id: string;
  question: string;
  category: string | null;
  image_url: string | null;
  close_at: string | null;
  volume?: number | null;
  market_outcomes: MarketOutcome[];
}

export function useMarkets() {
  const queryClient = useQueryClient();

  const result = useQuery<Market[]>({
    queryKey: ['markets', 'open'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select(
          'id, question, category, image_url, close_at, volume, market_outcomes!market_outcomes_market_id_fkey(id, name, odds, effective_odds)',
        )
        .eq('status', 'open')
        .eq('is_visible', true)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Market[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('market_outcomes_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'market_outcomes' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['markets'] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return result;
}
