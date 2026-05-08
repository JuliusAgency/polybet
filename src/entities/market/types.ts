import type { MarketEvent } from '@/entities/event';

export type MarketStatus = 'open' | 'closed' | 'resolved' | 'archived';

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
  status: MarketStatus;
  winning_outcome_id: string | null;
  category: string | null;
  image_url: string | null;
  close_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  volume?: number | null;
  sort_volume?: number | null;
  event_id: string | null;
  group_label: string | null;
  // Denormalized from events.tag_slugs (migration 069). May be missing on
  // legacy cached records read before the column existed; treat as optional.
  tag_slugs?: string[];
  // Denormalized from events.trending_rank / events.volume_24hr (migration 075).
  // Maintained by the sync edge function from Polymarket's /events?featured=true
  // response. Used to order the Trending tab so it matches Polymarket exactly.
  // May be missing on legacy cached records — treat as optional.
  trending_rank?: number | null;
  volume_24hr?: number | null;
  event: MarketEvent | null;
  market_outcomes: MarketOutcome[];
}
