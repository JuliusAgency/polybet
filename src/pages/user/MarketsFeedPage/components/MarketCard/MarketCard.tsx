import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import type { Market, MarketOutcome } from '@/features/bet';

interface MarketCardProps {
  market: Market;
  mode?: 'interactive' | 'readonly';
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
}

export const MarketCard = ({
  market,
  mode = 'interactive',
  onOutcomeClick,
}: MarketCardProps) => {
  const { t } = useTranslation();
  const [hoveredOutcomeId, setHoveredOutcomeId] = useState<string | null>(null);
  const isInteractive = mode === 'interactive';
  const winnerOutcome = market.winning_outcome_id
    ? market.market_outcomes.find((outcome) => outcome.id === market.winning_outcome_id) ?? null
    : null;
  const statusLabel = t(`markets.status.${market.status}`, {
    defaultValue: market.status.toUpperCase(),
  });
  const uppercaseStatusLabel = statusLabel.toUpperCase();

  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Category badge */}
      {(market.category || market.status) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {market.category && <Badge variant="default">{market.category}</Badge>}
          <Badge variant={market.status === 'resolved' ? 'win' : 'default'}>
            {uppercaseStatusLabel}
          </Badge>
        </div>
      )}

      {/* Question */}
      <p
        className="mb-3 text-base font-medium"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {market.question}
      </p>

      {/* Summary row */}
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {t('markets.marketId')}: {market.id}
        </p>
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {t('markets.polymarketId')}: {market.polymarket_id}
        </p>
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {t('markets.source')}: Polymarket
        </p>
        {market.volume != null && market.volume > 0 && (
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {t('markets.volume')}: {market.volume.toLocaleString()}
          </p>
        )}
        {market.close_at && (
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {t('markets.closesAt')}:{' '}
            {new Date(market.close_at).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        )}
      </div>

      {/* Outcomes */}
      <div className="flex flex-wrap gap-2">
        {market.market_outcomes.map((outcome) => {
          const isHovered = isInteractive && hoveredOutcomeId === outcome.id;
          const effectiveOddsChanged = outcome.effective_odds !== outcome.odds;
          const outcomeContent = (
            <>
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {outcome.name}
                {winnerOutcome?.id === outcome.id ? ` • ${t('markets.finalOutcome')}` : ''}
              </span>
              {outcome.price != null && (
                <span className="ms-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('markets.probability')}: {(outcome.price * 100).toFixed(1)}%
                </span>
              )}
              <span className="ms-2 font-semibold" style={{ color: 'var(--color-accent)' }}>
                {outcome.odds.toFixed(2)}
              </span>
              {effectiveOddsChanged && (
                <span className="ms-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('markets.effectiveOdds')}: {outcome.effective_odds.toFixed(2)}
                </span>
              )}
              <span className="ms-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {t('markets.updatedAt')}:{' '}
                {new Date(outcome.updated_at).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </>
          );

          if (!isInteractive || !onOutcomeClick) {
            return (
              <div
                key={outcome.id}
                className="rounded-lg px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--color-bg-base)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {outcomeContent}
              </div>
            );
          }

          return (
            <button
              key={outcome.id}
              onClick={() => onOutcomeClick(market, outcome)}
              onMouseEnter={() => setHoveredOutcomeId(outcome.id)}
              onMouseLeave={() => setHoveredOutcomeId(null)}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm transition-colors"
              style={{
                backgroundColor: 'var(--color-bg-base)',
                border: isHovered
                  ? '1px solid var(--color-accent)'
                  : '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              {outcomeContent}
            </button>
          );
        })}
      </div>
    </div>
  );
};
