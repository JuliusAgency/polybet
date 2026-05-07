import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { Market, MarketStatusFilter } from './useMarkets';

const STATUS_MAP: Record<MarketStatusFilter, ('open' | 'closed' | 'resolved' | 'archived')[]> = {
  all: ['open', 'closed', 'resolved', 'archived'],
  open: ['open'],
  closed: ['closed'],
  resolved: ['resolved'],
  archived: ['archived'],
};

/**
 * Fetches all markets that belong to the given events. Used by the Saved page
 * to render saved events as standard event cards (top-N rows preview), instead
 * of fetching only the markets the user previously toggled inside the event.
 */
export function useEventsByIds(
  eventIds: string[],
  statusFilter: MarketStatusFilter,
  enabled: boolean
) {
  const sortedEventIds = [...eventIds].sort();

  return useQuery<Market[]>({
    queryKey: ['markets-by-event-ids', statusFilter, sortedEventIds],
    enabled: enabled && sortedEventIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      let query = supabase
        .from('markets')
        .select(
          'id, polymarket_id, question, status, winning_outcome_id, category, image_url, close_at, last_synced_at, created_at, volume, sort_volume, trending_rank, volume_24hr, event_id, group_label, event:event_id(id, title, description, category, image_url, close_at, status, volume, tag_slug, tag_label, tag_slugs), market_outcomes!market_outcomes_market_id_fkey(id, name, price, odds, effective_odds, updated_at, polymarket_token_id)'
        )
        .in('event_id', sortedEventIds);

      // Mirror useMarkets status rules for consistency between feed and saved.
      if (statusFilter === 'open') {
        const nowIso = new Date().toISOString();
        query = query.eq('status', 'open').or(`close_at.is.null,close_at.gt.${nowIso}`);
      } else if (statusFilter === 'closed') {
        const nowIso = new Date().toISOString();
        query = query.or(`status.eq.closed,and(status.eq.open,close_at.lte.${nowIso})`);
      } else if (statusFilter !== 'all') {
        query = query.in('status', STATUS_MAP[statusFilter]);
      }

      query = query
        .order('sort_volume', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Market[];
    },
  });
}
