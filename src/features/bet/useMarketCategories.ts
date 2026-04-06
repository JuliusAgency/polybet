import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export function useMarketCategories() {
  return useQuery<string[]>({
    queryKey: ['market-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select('category')
        .eq('is_visible', true)
        .not('category', 'is', null)
        .order('category', { ascending: true });

      if (error) throw new Error(error.message);

      const unique = Array.from(
        new Set((data ?? []).map((r) => r.category as string).filter(Boolean))
      );
      return unique.sort((a, b) => a.localeCompare(b));
    },
    staleTime: 5 * 60 * 1000, // 5 min — categories change rarely
  });
}
