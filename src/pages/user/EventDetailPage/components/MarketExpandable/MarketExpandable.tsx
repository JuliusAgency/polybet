import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Market, MarketOutcome, MyBet, PriceHistoryWindow } from '@/features/bet';
import { usePriceHistory } from '@/features/bet';
import { MarketCard } from '@/pages/user/MarketsFeedPage/components/MarketCard';
import { PriceHistoryChart, PriceHistoryWindowToggle } from '@/shared/ui/PriceHistoryChart';

interface MarketExpandableProps {
  market: Market;
  userBet?: MyBet;
  defaultExpanded?: boolean;
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
}

export const MarketExpandable = ({
  market,
  userBet,
  defaultExpanded = false,
  onOutcomeClick,
}: MarketExpandableProps) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [window, setWindow] = useState<PriceHistoryWindow>('ALL');

  const { data: points = [], isLoading } = usePriceHistory(market.id, window, expanded);

  return (
    <section
      className="flex flex-col gap-3"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <MarketCard
        market={market}
        userBet={userBet}
        mode={market.status === 'open' ? 'interactive' : 'readonly'}
        onOutcomeClick={onOutcomeClick}
      />

      <div
        className="flex items-center justify-between gap-2 px-4"
        style={{ borderTop: '1px solid var(--color-border-subtle)' }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="-mx-2 flex items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium transition-colors hover:opacity-80"
          style={{
            color: 'var(--color-text-secondary)',
            transitionDuration: 'var(--duration-fast)',
            transitionTimingFunction: 'var(--ease-out-expo)',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform var(--duration-fast) var(--ease-out-expo)',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          {expanded
            ? t('eventDetail.hideChart', { defaultValue: 'Hide chart' })
            : t('eventDetail.showChart', { defaultValue: 'Show chart' })}
        </button>

        {expanded && <PriceHistoryWindowToggle value={window} onChange={setWindow} />}
      </div>

      {expanded && (
        <div className="px-4 pb-4">
          <PriceHistoryChart
            points={points}
            outcomes={market.market_outcomes}
            isLoading={isLoading}
          />
        </div>
      )}
    </section>
  );
};
