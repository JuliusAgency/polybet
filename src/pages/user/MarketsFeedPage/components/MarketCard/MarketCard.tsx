import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Market, MarketOutcome, MyBet } from '@/features/bet';
import { useMarketRefresh } from '@/features/bet';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import { MarketThumbnail } from '@/shared/ui/MarketThumbnail';
import { BookmarkButton } from '@/shared/ui/BookmarkButton';
import { ChanceGauge } from '@/shared/ui/ChanceGauge';
import { BetMarker } from '@/shared/ui/BetMarker';
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
  // Arc gauge only reads outcome[0].price, so limit it to binary (Yes/No)
  // markets where that price is the "Yes chance". For multi-outcome markets
  // outcome[0] is just one of many and a single gauge would be misleading.
  const isBinary = market.market_outcomes.length === 2;
  const yesProbability = isBinary && yesOutcome?.price != null ? yesOutcome.price : null;

  const volumeLabel = formatVolume(market.volume ?? null);
  const closesDate = formatClosesDate(market.close_at, i18n.language);
  const statusLabel =
    effectiveStatus !== 'open'
      ? t(`markets.status.${effectiveStatus}`, { defaultValue: effectiveStatus.toUpperCase() })
      : null;

  return (
    <article
      className="flex flex-col gap-3 p-3 transition-[transform,box-shadow] motion-reduce:transition-none hover:-translate-y-0.5 hover:[box-shadow:var(--shadow-md)] motion-reduce:hover:translate-y-0"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        transitionDuration: 'var(--duration-base)',
        transitionTimingFunction: 'var(--ease-out-expo)',
      }}
    >
      {/* Header: thumb + title on the start; probability gauge pinned to the
          inline-end so buttons below can span the full width. */}
      <header className="-mx-1 -mt-1 flex items-start gap-2.5 rounded-md p-1">
        {linkToEvent && market.event_id ? (
          <Link
            to={`/events/${market.event_id}`}
            aria-label={t('eventDetail.open', { defaultValue: 'Open event details' })}
            className="group/title flex min-w-0 flex-1 items-start gap-2.5"
          >
            <MarketCardHeaderContent market={market} withTitleHover />
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <MarketCardHeaderContent market={market} />
          </div>
        )}
        {yesProbability != null && (
          <div className="shrink-0">
            <ChanceGauge value={yesProbability} size={52} />
          </div>
        )}
      </header>

      {/* Outcome CTAs — full-width, gauge moved to the header. */}
      <div className="flex min-h-20 items-center">
        <div className="min-w-0 flex-1">
          <OutcomeButtons
            outcomes={outcomeButtons}
            size="xl"
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
        className="flex items-center justify-between gap-3 text-xs"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <div className="flex items-center gap-3">
          {volumeLabel && (
            <span className="font-mono">{t('markets.volumeShort', { value: volumeLabel })}</span>
          )}
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
          {showRefreshAction && isStale && (
            <span title={t('markets.syncedStale')} style={{ color: 'var(--color-loss)' }}>
              ⚠
            </span>
          )}
          {userBet && <BetMarker />}
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
  withTitleHover?: boolean;
}

function MarketCardHeaderContent({ market, withTitleHover = false }: MarketCardHeaderContentProps) {
  const { i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';
  const category = market.category ?? market.event?.category ?? null;

  return (
    <>
      <MarketThumbnail src={market.image_url} title={market.question} id={market.id} size="md" />
      <div className="min-w-0 flex-1">
        <h3
          className={`line-clamp-2 text-sm font-semibold leading-snug underline-offset-2 decoration-1 ${
            withTitleHover ? 'group-hover/title:underline' : ''
          }`}
          style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
        >
          {market.question}
        </h3>
        {category && (
          <div
            className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium ${
              isHebrew ? '' : 'uppercase tracking-wide'
            }`}
            style={{ color: 'var(--color-text-muted)' }}
          >
            <span>{category}</span>
          </div>
        )}
      </div>
    </>
  );
}
