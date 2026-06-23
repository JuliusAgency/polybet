import type { FeedItem } from '@/features/bet';
import type { MyBet } from '@/entities/bet';
import type { Market, MarketOutcome } from '@/entities/market';
import { MarketCard } from '@/widgets/MarketCard';
import { EventCard } from '@/widgets/EventCard';

interface FeedGridProps {
  items: FeedItem[];
  /** Responsive grid class (drops a column when the docked slip is open). */
  gridClassName: string;
  bets: MyBet[];
  /** Force EventCards to multi-row layout (My bets view filters out siblings). */
  forceMultiRow: boolean;
  eventMarketCounts: Record<string, number> | undefined;
  onOutcomeClick: (market: Market, outcome: MarketOutcome) => void;
  getUserBet: (marketId: string) => MyBet | undefined;
  getBetCount: (marketId: string) => number;
}

/**
 * The feed card grid: events grouped into EventCards and standalone markets into
 * MarketCards, with the staggered mount cascade. Extracted from MarketsFeedPage
 * verbatim; the page owns data/state and passes lookups in.
 */
export function FeedGrid({
  items,
  gridClassName,
  bets,
  forceMultiRow,
  eventMarketCounts,
  onOutcomeClick,
  getUserBet,
  getBetCount,
}: FeedGridProps) {
  return (
    <div className={gridClassName}>
      {items.map((item, index) => {
        const card =
          item.type === 'event' ? (
            <EventCard
              event={item.event}
              markets={item.markets}
              bets={bets}
              mode={item.event.status === 'archived' ? 'readonly' : 'interactive'}
              onOutcomeClick={onOutcomeClick}
              // In "my bets" mode only the user's wagered markets are passed;
              // force multi-row so a truly multi-market event doesn't collapse
              // into the single-market visual just because siblings were filtered out.
              forceMultiRow={forceMultiRow}
              totalMarketsCount={eventMarketCounts?.[item.event.id]}
            />
          ) : (
            <MarketCard
              market={item.market}
              userBet={getUserBet(item.market.id)}
              betCount={getBetCount(item.market.id)}
              mode={
                item.market.status === 'open' || item.market.status === 'closed'
                  ? 'interactive'
                  : 'readonly'
              }
              showRefreshAction={false}
              showCloseDate={false}
              onOutcomeClick={onOutcomeClick}
            />
          );
        return (
          <div
            key={item.key}
            className="card-enter"
            style={{
              contentVisibility: 'auto',
              containIntrinsicSize: 'auto 260px',
              // Staggered cascade for a diagonal top-to-bottom reveal.
              // Capped so infinite-scroll cards never accrue an unbounded
              // delay — the cascade runs across the first ~15 cards, the
              // rest fade in together a beat later. The animation fires once
              // on mount (stable key), so polling/refetch never replays it.
              animationDelay: `${Math.min(index, 14) * 35}ms`,
            }}
          >
            {card}
          </div>
        );
      })}
    </div>
  );
}
