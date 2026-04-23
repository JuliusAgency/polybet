import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Market, MarketOutcome, MyBet, PriceHistoryWindow } from '@/features/bet';
import { usePriceHistory } from '@/features/bet';
import { MarketCard } from '@/pages/user/MarketsFeedPage/components/MarketCard';
import { PriceHistoryChart, PriceHistoryWindowToggle } from '@/shared/ui/PriceHistoryChart';

interface SingleMarketViewProps {
  market: Market;
  userBet?: MyBet;
  description?: string | null;
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
}

export const SingleMarketView = ({
  market,
  userBet,
  description,
  onOutcomeClick,
}: SingleMarketViewProps) => {
  const { t, i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';
  const [window, setWindow] = useState<PriceHistoryWindow>('ALL');
  const { data: points = [], isLoading } = usePriceHistory(market.id, window, true);

  return (
    <div className="flex flex-col gap-4">
      <section
        className="flex flex-col gap-3 p-4"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('eventDetail.priceHistory', { defaultValue: 'Price history' })}
          </h3>
          <PriceHistoryWindowToggle value={window} onChange={setWindow} />
        </div>
        <PriceHistoryChart
          points={points}
          outcomes={market.market_outcomes}
          isLoading={isLoading}
        />
      </section>

      <MarketCard
        market={market}
        userBet={userBet}
        mode={market.status === 'open' ? 'interactive' : 'readonly'}
        onOutcomeClick={onOutcomeClick}
        linkToEvent={false}
      />

      {description && description.trim().length > 0 && (
        <section
          className="flex flex-col gap-2 p-4"
          style={{
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('eventDetail.rules', { defaultValue: 'Rules' })}
          </h3>
          <p
            className="whitespace-pre-line text-sm leading-relaxed"
            style={{
              color: 'var(--color-text-secondary)',
              ...(isHebrew && { direction: 'ltr' as const, textAlign: 'right' as const }),
            }}
          >
            {description}
          </p>
        </section>
      )}
    </div>
  );
};
