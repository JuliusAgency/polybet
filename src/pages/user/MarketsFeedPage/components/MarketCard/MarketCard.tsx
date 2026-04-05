import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Market, MarketOutcome } from '@/features/bet';
import { useMarketRefresh } from '@/features/bet';
import { MARKETS_STALE_THRESHOLD_MS } from '@/shared/config/markets';
import { useTicker } from '@/shared/hooks/useTicker';

function formatOutcomeUpdatedAt(
  timestamp: string,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const minutes = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  if (minutes < 1) return t('markets.updatedJustNow');
  return t('markets.updatedMinutesAgo', { minutes });
}

function PriceMovementIndicator({
  currentPrice,
  previousPrice,
}: {
  currentPrice: number;
  previousPrice: number | undefined;
}) {
  const { t } = useTranslation();
  if (previousPrice === undefined || currentPrice === previousPrice) return null;
  const up = currentPrice > previousPrice;
  return (
    <span
      className="ms-1 text-xs font-semibold"
      title={up ? t('markets.priceUp') : t('markets.priceDown')}
      style={{ color: up ? 'var(--color-win)' : 'var(--color-loss, #ef4444)' }}
    >
      {up ? '▲' : '▼'}
    </span>
  );
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  open: {
    bg: 'color-mix(in srgb, var(--color-win) 12%, transparent)',
    text: 'var(--color-win)',
    dot: 'var(--color-win)',
  },
  closed: {
    bg: 'color-mix(in srgb, var(--color-text-secondary) 12%, transparent)',
    text: 'var(--color-text-secondary)',
    dot: 'var(--color-text-secondary)',
  },
  resolved: {
    bg: 'color-mix(in srgb, #a78bfa 12%, transparent)',
    text: '#a78bfa',
    dot: '#a78bfa',
  },
  archived: {
    bg: 'color-mix(in srgb, var(--color-text-secondary) 8%, transparent)',
    text: 'var(--color-text-secondary)',
    dot: 'var(--color-text-secondary)',
  },
};

interface MarketCardProps {
  market: Market;
  mode?: 'interactive' | 'readonly';
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
  previousPrices?: Record<string, number>;
  onArchive?: (market: Market) => void;
  isArchiving?: boolean;
}

export const MarketCard = ({
  market,
  mode = 'interactive',
  onOutcomeClick,
  previousPrices,
  onArchive,
  isArchiving = false,
}: MarketCardProps) => {
  const { t } = useTranslation();
  const { isRefreshing, refresh } = useMarketRefresh(
    market.polymarket_id ? [market.polymarket_id] : [],
    false // no auto-interval per card; global auto-refresh runs in useMarkets
  );
  useTicker(10_000); // re-render every 10s so "X ago" labels stay current
  const isStale = market.last_synced_at
    ? Date.now() - new Date(market.last_synced_at).getTime() > MARKETS_STALE_THRESHOLD_MS
    : false;
  const [hoveredOutcomeId, setHoveredOutcomeId] = useState<string | null>(null);
  const isInteractive = mode === 'interactive';

  const winnerOutcome = market.winning_outcome_id
    ? (market.market_outcomes.find((o) => o.id === market.winning_outcome_id) ?? null)
    : null;

  const statusStyle = STATUS_STYLES[market.status] ?? STATUS_STYLES.closed;

  const statusLabel = t(`markets.status.${market.status}`, {
    defaultValue: market.status.toUpperCase(),
  });

  const outcomesUpdatedAt = market.market_outcomes.map((o) => o.updated_at);
  const allSameUpdatedAt =
    outcomesUpdatedAt.length > 0 && outcomesUpdatedAt.every((t) => t === outcomesUpdatedAt[0]);
  const sharedUpdatedAt = allSameUpdatedAt ? outcomesUpdatedAt[0] : null;

  const closesDate = market.close_at
    ? new Date(market.close_at).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <div
      className="flex flex-col gap-3 rounded-xl p-4"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Top row: status pill + category + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Status pill */}
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide"
            style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: statusStyle.dot }}
            />
            {statusLabel}
          </span>
          {/* Category */}
          {market.category && (
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {market.category}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {onArchive && market.status === 'resolved' && (
            <button
              onClick={() => onArchive(market)}
              disabled={isArchiving}
              className="rounded-lg p-1.5 text-xs transition-opacity disabled:opacity-40"
              style={{
                color: 'var(--color-loss, #ef4444)',
                backgroundColor: 'color-mix(in srgb, var(--color-loss, #ef4444) 8%, transparent)',
              }}
              title={t('markets.archive')}
            >
              {isArchiving ? '…' : '⊗'}
            </button>
          )}
          {market.polymarket_id && (
            <button
              onClick={() => void refresh()}
              disabled={isRefreshing}
              className="rounded-lg px-2 py-1 text-xs font-medium transition-opacity disabled:opacity-40"
              style={{
                backgroundColor: 'var(--color-bg-base)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
              title={t('markets.refreshOdds')}
            >
              {isRefreshing ? '↻' : t('markets.refreshOdds')}
            </button>
          )}
        </div>
      </div>

      {/* Question */}
      <p
        className="text-sm font-semibold leading-snug"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {market.question}
      </p>

      {/* Winner banner */}
      {winnerOutcome && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-win) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-win) 30%, transparent)',
            color: 'var(--color-win)',
          }}
        >
          <span>✓</span>
          <strong>{winnerOutcome.name}</strong>
        </div>
      )}

      {/* Outcome buttons */}
      <div className="flex flex-wrap gap-2">
        {market.market_outcomes.map((outcome) => {
          const isHovered = isInteractive && hoveredOutcomeId === outcome.id;
          const isWinner = winnerOutcome?.id === outcome.id;
          const effectiveOddsChanged = outcome.effective_odds !== outcome.odds;

          const inner = (
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-medium"
                style={{ color: isWinner ? 'var(--color-win)' : 'var(--color-text-secondary)' }}
              >
                {outcome.name}
              </span>
              <span
                className="text-sm font-bold"
                title={effectiveOddsChanged ? t('markets.marginApplied') : undefined}
                style={{ color: isWinner ? 'var(--color-win)' : 'var(--color-accent)' }}
              >
                {outcome.effective_odds.toFixed(2)}
              </span>
              {effectiveOddsChanged && (
                <span
                  className="text-xs line-through opacity-50"
                  title={t('markets.rawOdds', { odds: outcome.odds.toFixed(2) })}
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {outcome.odds.toFixed(2)}
                </span>
              )}
              {outcome.price != null && (
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {(outcome.price * 100).toFixed(0)}%
                </span>
              )}
              {outcome.price != null && previousPrices && outcome.polymarket_token_id && (
                <PriceMovementIndicator
                  currentPrice={outcome.price}
                  previousPrice={previousPrices[outcome.polymarket_token_id]}
                />
              )}
            </div>
          );

          const sharedStyle = {
            backgroundColor: isWinner
              ? 'color-mix(in srgb, var(--color-win) 10%, var(--color-bg-base))'
              : 'var(--color-bg-base)',
            border: isWinner
              ? '1px solid color-mix(in srgb, var(--color-win) 40%, transparent)'
              : isHovered
                ? '1px solid var(--color-accent)'
                : '1px solid var(--color-border)',
          };

          if (!isInteractive || !onOutcomeClick) {
            return (
              <div key={outcome.id} className="rounded-lg px-3 py-2" style={sharedStyle}>
                {inner}
              </div>
            );
          }

          return (
            <button
              key={outcome.id}
              onClick={() => onOutcomeClick(market, outcome)}
              onMouseEnter={() => setHoveredOutcomeId(outcome.id)}
              onMouseLeave={() => setHoveredOutcomeId(null)}
              className="cursor-pointer rounded-lg px-3 py-2 transition-colors"
              style={sharedStyle}
            >
              {inner}
            </button>
          );
        })}
      </div>

      {/* Footer: meta info */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {market.volume != null && market.volume > 0 && (
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Vol {market.volume.toLocaleString()}
          </span>
        )}
        {closesDate && (
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {market.status === 'open' ? t('markets.closesAt') : t('markets.closedAt')} {closesDate}
          </span>
        )}
        {/* Show outcome timestamp only when data is fresh; stale badge replaces it */}
        {!isStale && sharedUpdatedAt && (
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {t('markets.updatedAt')} {formatOutcomeUpdatedAt(sharedUpdatedAt, t)}
          </span>
        )}
        {/* Stale badge — shown only when last_synced_at is older than threshold */}
        {isStale && (
          <span className="ms-auto text-xs" style={{ color: 'var(--color-loss, #ef4444)' }}>
            {t('markets.syncedStale')}
          </span>
        )}
      </div>
    </div>
  );
};
