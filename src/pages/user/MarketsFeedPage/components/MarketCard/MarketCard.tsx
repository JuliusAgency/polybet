import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Market, MarketOutcome, MyBet } from '@/features/bet';
import { useMarketRefresh } from '@/features/bet';
import { Badge } from '@/shared/ui/Badge';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import { MarketThumbnail } from '@/shared/ui/MarketThumbnail';
import { BookmarkButton } from '@/shared/ui/BookmarkButton';
import { MARKETS_STALE_THRESHOLD_MS } from '@/shared/config/markets';
import { useTicker } from '@/shared/hooks/useTicker';
import { formatVolume } from '@/shared/utils';

interface MarketCardProps {
  market: Market;
  userBet?: MyBet;
  mode?: 'interactive' | 'readonly';
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
  onArchive?: (market: Market) => void;
  isArchiving?: boolean;
  linkToEvent?: boolean;
  showRefreshAction?: boolean;
  showCloseDate?: boolean;
}

function formatClosesDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(locale === 'he' ? 'he-IL' : undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const MarketCard = ({
  market,
  userBet,
  mode = 'interactive',
  onOutcomeClick,
  onArchive,
  isArchiving = false,
  linkToEvent = true,
  showRefreshAction = true,
  showCloseDate = true,
}: MarketCardProps) => {
  const { t, i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';
  const { isRefreshing, lastResult, refresh } = useMarketRefresh(
    market.polymarket_id ? [market.polymarket_id] : [],
    false
  );
  useTicker(10_000);

  const isStale = market.last_synced_at
    ? Date.now() - new Date(market.last_synced_at).getTime() > MARKETS_STALE_THRESHOLD_MS
    : true;
  const isExpired = market.close_at != null && new Date(market.close_at).getTime() <= Date.now();
  const effectiveStatus = isExpired && market.status === 'open' ? 'closed' : market.status;
  const isInteractive = mode === 'interactive' && effectiveStatus === 'open' && !isExpired;

  const winnerOutcome = market.winning_outcome_id
    ? (market.market_outcomes.find((o) => o.id === market.winning_outcome_id) ?? null)
    : null;

  const outcomeButtons: OutcomeButton[] = market.market_outcomes.map((o) => ({
    id: o.id,
    name: o.name,
    price: o.price,
    effectiveOdds: o.effective_odds,
    isWinner: winnerOutcome?.id === o.id,
  }));

  const yesOutcome = market.market_outcomes[0];
  const yesPct = yesOutcome?.price != null ? `${Math.round(yesOutcome.price * 100)}%` : null;

  const volumeLabel = formatVolume(market.volume ?? null);
  const closesDate = formatClosesDate(market.close_at, i18n.language);
  const statusLabel =
    effectiveStatus !== 'open'
      ? t(`markets.status.${effectiveStatus}`, { defaultValue: effectiveStatus.toUpperCase() })
      : null;

  return (
    <article
      className="flex h-full min-h-[256px] flex-col gap-3 p-3 sm:p-4"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {/* Header: thumb + title + meta (same structure as EventCard). */}
      {linkToEvent && market.event_id ? (
        <Link
          to={`/events/${market.event_id}`}
          aria-label={t('eventDetail.open', { defaultValue: 'Open event details' })}
          className="-mx-1 -mt-1 flex items-start gap-2.5 rounded-md p-1 transition-opacity hover:opacity-90"
          style={{ transitionDuration: 'var(--duration-fast)' }}
        >
          <MarketCardHeaderContent market={market} volumeLabel={volumeLabel} />
        </Link>
      ) : (
        <header className="flex items-start gap-2.5">
          <MarketCardHeaderContent market={market} volumeLabel={volumeLabel} />
        </header>
      )}

      {/* User bet inline — only if present */}
      {userBet && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 text-xs"
          style={{
            backgroundColor: 'color-mix(in oklch, var(--color-accent) 10%, transparent)',
            border: '1px solid color-mix(in oklch, var(--color-accent) 30%, transparent)',
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)' }}>{t('markets.yourBet')}:</span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {userBet.market_outcomes?.name ?? '—'}
          </span>
          <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>
            {userBet.stake.toFixed(2)}
          </span>
          {userBet.status === 'open' && (
            <span className="font-mono" style={{ color: 'var(--color-accent)' }}>
              → {userBet.potential_payout.toFixed(2)}
            </span>
          )}
          {userBet.status !== 'open' && (
            <Badge variant={userBet.status === 'won' ? 'win' : 'loss'}>
              {userBet.status === 'won' ? t('bet.won') : t('bet.lost')}
            </Badge>
          )}
        </div>
      )}

      {/* Outcome CTAs — Polymarket style with big % and hover-shows-percentage buttons */}
      <div className="flex items-center gap-4">
        {yesPct && (
          <span
            className="shrink-0 text-xl font-bold tabular-nums"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {yesPct}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <OutcomeButtons
            outcomes={outcomeButtons}
            size="sm"
            disabled={!isInteractive}
            showPercentage={false}
            hoverShowsPercentage
            onClick={
              isInteractive && onOutcomeClick
                ? (outcomeId) => {
                    const outcome = market.market_outcomes.find((o) => o.id === outcomeId);
                    if (outcome) onOutcomeClick(market, outcome);
                  }
                : undefined
            }
          />
        </div>
      </div>

      {/* Footer: metadata as icons + compact text */}
      <footer
        className="mt-auto flex items-center justify-between gap-3 text-xs"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <div className="flex items-center gap-3">
          {showCloseDate && closesDate && (
            <span className="font-mono">
              {effectiveStatus === 'open' ? t('markets.closesAt') : t('markets.closedAt')}{' '}
              {closesDate}
            </span>
          )}
          {statusLabel && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isHebrew ? '' : 'uppercase tracking-wide'
              }`}
              style={{
                backgroundColor: `color-mix(in oklch, var(--color-${effectiveStatus === 'resolved' ? 'resolved' : 'text-secondary'}) 14%, transparent)`,
                color:
                  effectiveStatus === 'resolved'
                    ? 'var(--color-resolved)'
                    : 'var(--color-text-secondary)',
              }}
            >
              {statusLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isStale && (
            <span title={t('markets.syncedStale')} style={{ color: 'var(--color-loss)' }}>
              ⚠
            </span>
          )}
          <BookmarkButton marketId={market.id} />
          {showRefreshAction && market.polymarket_id && (
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isRefreshing}
              title={
                lastResult === 'failed' ? t('markets.refreshFailed') : t('markets.refreshOdds')
              }
              aria-label={t('markets.refreshOdds')}
              className="rounded-md p-1 transition-colors hover:opacity-80 disabled:opacity-40"
              style={{
                color:
                  lastResult === 'ok'
                    ? 'var(--color-win)'
                    : lastResult === 'failed'
                      ? 'var(--color-loss)'
                      : 'var(--color-text-secondary)',
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
                style={{
                  animation: isRefreshing ? 'spin 1s linear infinite' : undefined,
                }}
                aria-hidden="true"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
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
      </footer>
    </article>
  );
};

interface MarketCardHeaderContentProps {
  market: Market;
  volumeLabel: string | null;
}

function MarketCardHeaderContent({ market, volumeLabel }: MarketCardHeaderContentProps) {
  const { t, i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';
  const category = market.category ?? market.event?.category ?? null;

  return (
    <>
      <MarketThumbnail src={market.image_url} title={market.question} id={market.id} size="md" />
      <div className="min-w-0 flex-1">
        <h3
          className="line-clamp-2 text-sm font-semibold leading-snug"
          style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
        >
          {market.question}
        </h3>
        {(category || volumeLabel) && (
          <div
            className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium ${
              isHebrew ? '' : 'uppercase tracking-wide'
            }`}
            style={{ color: 'var(--color-text-muted)' }}
          >
            {category && <span>{category}</span>}
            {volumeLabel && (
              <span className="font-mono">{t('markets.volumeShort', { value: volumeLabel })}</span>
            )}
          </div>
        )}
      </div>
    </>
  );
}
