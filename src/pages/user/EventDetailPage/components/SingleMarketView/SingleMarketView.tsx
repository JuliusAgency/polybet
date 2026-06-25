import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Market, MarketOutcome } from '@/entities/market';
import {
  getChartOutcomes,
  getOrderedOutcomes,
  getYesProbability,
  getResolvedWinnerOutcome,
} from '@/entities/market';
import type { MyBet } from '@/entities/bet';
import type { PriceHistoryWindow } from '@/features/bet';
import { usePriceHistory } from '@/features/bet';
import { Badge } from '@/shared/ui/Badge';
import { MarketThumbnail } from '@/shared/ui/MarketThumbnail';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import { PriceHistoryChart, PriceHistoryWindowToggle } from '@/shared/ui/PriceHistoryChart';
import { formatProbability } from '@/shared/utils';

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

  // Compact selected-outcome row + Buy Yes/No, mirroring EventMarketRow — the
  // binary detail shows the outcome ONCE (no repeated feed card under the chart).
  const label = market.group_label ?? market.question;
  const yesPrice = getYesProbability(market);
  const yesPct = yesPrice != null ? formatProbability(yesPrice) : null;
  const winnerOutcome = getResolvedWinnerOutcome(market);
  const isInteractive = !readonly && market.status === 'open';

  const outcomeButtons: OutcomeButton[] = getOrderedOutcomes(market).map((o) => ({
    id: o.id,
    name: o.name,
    price: o.price,
    effectiveOdds: o.effective_odds,
    isWinner: winnerOutcome?.id === o.id,
    untradable: !o.polymarket_token_id,
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* Price history — full-bleed on mobile (no card frame); the framed card
          returns at md+ so the desktop look is unchanged. */}
      <section
        className="flex flex-col gap-3 md:rounded-[var(--radius-lg)] md:border md:bg-[var(--color-bg-surface)] md:p-4"
        style={{ borderColor: 'var(--color-border)' }}
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

      {/* Compact selected-outcome row — thumbnail + label + inline Yes %, then
          the Buy Yes/No pills beneath. Replaces the repeated feed card. */}
      <div
        className="flex flex-col gap-3 md:rounded-[var(--radius-lg)] md:border md:bg-[var(--color-bg-surface)] md:p-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3">
          <MarketThumbnail src={market.image_url} title={label} id={market.id} size="sm" />
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-semibold"
              style={{
                color: 'var(--color-text-primary)',
                ...(isHebrew && { direction: 'ltr' as const, textAlign: 'right' as const }),
              }}
            >
              {label}
            </p>
            {userBet && (
              <span
                className="mt-0.5 flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--color-accent)' }}
              >
                <span>{t('markets.yourBet')}:</span>
                <span style={{ fontWeight: 600 }}>{userBet.market_outcomes?.name ?? '—'}</span>
                <span className="font-mono">{userBet.stake.toFixed(2)}</span>
                {userBet.status !== 'open' && (
                  <Badge variant={userBet.status === 'won' ? 'win' : 'loss'}>
                    {userBet.status === 'won' ? t('bet.won') : t('bet.lost')}
                  </Badge>
                )}
              </span>
            )}
          </div>
          {yesPct && (
            <div className="shrink-0 ps-2 text-end">
              <div
                className="text-lg font-bold tabular-nums"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {yesPct}
              </div>
            </div>
          )}
          {onArchive && market.status === 'resolved' && (
            <button
              type="button"
              onClick={() => onArchive(market)}
              disabled={isArchiving}
              title={t('markets.archive')}
              aria-label={t('markets.archive')}
              className="rounded-md p-1 transition-colors hover:opacity-80 disabled:opacity-40"
              style={{ color: 'var(--color-text-secondary)' }}
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
              >
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
            </button>
          )}
        </div>

        {/* E7: bettable binary detail uses the Polymarket 'fill' look — BOTH
            sides solid-tinted (green Yes / red No) with cents — so the Buy pills
            read as solid and surface price. Readonly admin surface stays inert. */}
        <OutcomeButtons
          outcomes={outcomeButtons}
          size="xl"
          showPercentage
          priceFormat="cents"
          appearance={readonly ? 'inactive' : 'fill'}
          disabled={!isInteractive}
          ctaLabel={t('markets.buy', { defaultValue: 'Buy' })}
          onClick={
            isInteractive && onOutcomeClick
              ? (outcomeId) => {
                  const outcome = market.market_outcomes.find((o) => o.id === outcomeId);
                  if (outcome && outcome.polymarket_token_id) {
                    onOutcomeClick(market, outcome);
                  }
                }
              : undefined
          }
        />
      </div>

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
