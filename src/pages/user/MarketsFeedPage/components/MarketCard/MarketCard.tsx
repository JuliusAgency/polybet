import { useState } from 'react';
import { Badge } from '@/shared/ui/Badge';
import type { Market, MarketOutcome } from '@/features/bet';

interface MarketCardProps {
  market: Market;
  onOutcomeClick: (outcome: MarketOutcome) => void;
}

export const MarketCard = ({ market, onOutcomeClick }: MarketCardProps) => {
  const [hoveredOutcomeId, setHoveredOutcomeId] = useState<string | null>(null);

  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Category badge */}
      {market.category && (
        <div className="mb-2">
          <Badge variant="default">{market.category}</Badge>
        </div>
      )}

      {/* Question */}
      <p
        className="mb-3 text-base font-medium"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {market.question}
      </p>

      {/* Outcomes */}
      <div className="flex flex-wrap gap-2">
        {market.market_outcomes.map((outcome) => {
          const isHovered = hoveredOutcomeId === outcome.id;
          return (
            <button
              key={outcome.id}
              onClick={() => onOutcomeClick(outcome)}
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
              <span style={{ color: 'var(--color-text-secondary)' }}>{outcome.name}</span>
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
