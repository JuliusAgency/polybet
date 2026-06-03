import { useMemo } from 'react';
import type { MyBet } from '@/entities/bet';
import type { Position } from '@/entities/position';
import { usePositions } from './usePositions';
import { usePositionHistory } from './usePositionHistory';

export type { MyBet } from '@/entities/bet';

// Adapter: the feed / event-page "you hold this" indicators were written against
// the legacy MyBet shape. In the positions model the equivalent is the user's
// position in an outcome, so this maps positions → MyBet so all those consumers
// (EventDetailPage, MarketsFeedPage, SavedMarketsPage, EventMarketRow, cards)
// keep working unchanged while reading live position data.
//
// We surface open positions plus settled (won/lost) ones — the same set the old
// hook returned for indicators and result badges. Sold-out ('closed') positions
// are excluded: the user exited, so there is no holding to mark. Reuses the
// usePositions / usePositionHistory queries, so existing buy/sell/settlement
// invalidation and polling keep this fresh with no extra wiring.
function toMyBet(p: Position): MyBet {
  return {
    id: p.id,
    market_id: p.market_id,
    outcome_id: p.outcome_id,
    stake: p.cost_basis,
    shares: p.shares,
    avg_price: p.avg_price,
    // Deprecated mirrors kept for the MyBet shape.
    locked_odds: p.avg_price > 0 ? 1 / p.avg_price : 0,
    potential_payout: p.shares,
    // 'closed' is filtered out before mapping, so this is always open|won|lost.
    status: p.status as MyBet['status'],
    placed_at: p.opened_at,
    settled_at: p.settled_at,
    seen_at: null,
    markets: p.markets,
    market_outcomes: p.market_outcomes ? { name: p.market_outcomes.name } : null,
  };
}

export function useMyBets() {
  const open = usePositions();
  const history = usePositionHistory();

  const data = useMemo<MyBet[]>(() => {
    const settled = (history.data ?? []).filter((p) => p.status === 'won' || p.status === 'lost');
    return [...(open.data ?? []), ...settled].map(toMyBet);
  }, [open.data, history.data]);

  return {
    data,
    isLoading: open.isLoading || history.isLoading,
    error: (open.error || history.error) instanceof Error ? open.error || history.error : null,
  };
}
