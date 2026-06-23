import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Market, MarketOutcome } from '@/entities/market';
import { getChartOutcomes } from '@/entities/market';
import type { MyBet } from '@/entities/bet';
import type { PriceHistoryWindow } from '@/features/bet';
import { usePriceHistory } from '@/features/bet';
import { MarketCard } from '@/widgets/MarketCard';
import { PriceHistoryChart, PriceHistoryWindowToggle } from '@/shared/ui/PriceHistoryChart';

interface SingleMarketViewProps {
  market: Market;
  userBet?: MyBet;
  description?: string | null;
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
  /** Read-only admin/manager surface: force the market card non-bettable and
   *  render the outcome pills as inactive. */
  readonly?: boolean;
  /** Admin archive control for resolved markets (super_admin only). */
  onArchive?: (market: Market) => void;
  isArchiving?: boolean;
}

export const SingleMarketView = ({
  market,
  userBet,
  description,
  onOutcomeClick,
  readonly = false,
  onArchive,
  isArchiving = false,
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
          outcomes={getChartOutcomes(market)}
          isLoading={isLoading}
        />
      </section>

      <MarketCard
        market={market}
        userBet={userBet}
        mode={!readonly && market.status === 'open' ? 'interactive' : 'readonly'}
        outcomeAppearance={readonly ? 'inactive' : 'default'}
        onOutcomeClick={onOutcomeClick}
        onArchive={onArchive}
        isArchiving={isArchiving}
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
