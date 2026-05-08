import type { MarketStatus } from './types';

export type MarketStatusFilter = 'all' | 'open' | 'closed' | 'resolved' | 'archived';

export const STATUS_MAP: Record<MarketStatusFilter, MarketStatus[]> = {
  all: ['open', 'closed', 'resolved', 'archived'],
  open: ['open'],
  closed: ['closed'],
  resolved: ['resolved'],
  archived: ['archived'],
};
