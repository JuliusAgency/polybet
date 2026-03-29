import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface MarketOutcome {
  id: string;
  name: string;
  price: number | null;
  odds: number;
  effective_odds: number;
  updated_at: string;
  polymarket_token_id: string | null;
}

export interface Market {
  id: string;
  polymarket_id: string;
  question: string;
  status: 'open' | 'closed' | 'resolved' | 'archived';
  winning_outcome_id: string | null;
  category: string | null;
  image_url: string | null;
  close_at: string | null;
  last_synced_at: string | null;
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
          'id, polymarket_id, question, status, winning_outcome_id, category, image_url, close_at, last_synced_at, volume, market_outcomes!market_outcomes_market_id_fkey(id, name, price, odds, effective_odds, updated_at, polymarket_token_id)',
        )
        .in('status', ['open', 'closed', 'resolved'])
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
