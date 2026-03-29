import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import type { Market, MarketOutcome } from '@/features/bet';

interface MarketCardProps {
  market: Market;
  onOutcomeClick: (market: Market, outcome: MarketOutcome) => void;
}

export const MarketCard = ({ market, onOutcomeClick }: MarketCardProps) => {
  const { t } = useTranslation();
  const [hoveredOutcomeId, setHoveredOutcomeId] = useState<string | null>(null);
  const winnerOutcome = market.winning_outcome_id
    ? market.market_outcomes.find((outcome) => outcome.id === market.winning_outcome_id) ?? null
    : null;
  const statusLabel = t(`markets.status.${market.status}`, { defaultValue: market.status });

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
          <Badge variant={market.status === 'resolved' ? 'win' : 'default'}>{statusLabel}</Badge>
        </div>
      )}

      {/* Question */}
      <p
        className="mb-3 text-base font-medium"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {market.question}
      </p>

      {/* Volume and close date */}
      <div className="mb-2 flex flex-wrap gap-x-4">
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
        {market.last_synced_at && (
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {t('markets.updatedAt')}:{' '}
            {new Date(market.last_synced_at).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>

      {/* Outcomes */}
      <div className="flex flex-wrap gap-2">
        {market.market_outcomes.map((outcome) => {
          const isHovered = hoveredOutcomeId === outcome.id;
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
            </button>
          );
        })}
      </div>
    </div>
  );
};
