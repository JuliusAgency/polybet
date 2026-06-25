import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Market, MarketOutcome } from '@/entities/market';
import {
  getMarketEffectiveStatus,
  getOrderedOutcomes,
  getYesProbability,
  getResolvedWinnerOutcome,
  isBinaryMarket,
} from '@/entities/market';
import type { MyBet } from '@/entities/bet';
import { useMarketRefresh } from '@/features/bet';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import { MarketThumbnail } from '@/shared/ui/MarketThumbnail';
import { BookmarkButton } from '@/features/favorites';
import { BetMarker } from '@/shared/ui/BetMarker';
import { MARKETS_STALE_THRESHOLD_MS } from '@/shared/config/markets';
import { useTicker } from '@/shared/hooks/useTicker';
import { formatVolume, formatProbability } from '@/shared/utils';

export interface MarketCardProps {
  market: Market;
  userBet?: MyBet;
  /** Total user bets on this market — feeds the BetMarker count badge so
   *  multi-bet markets read consistently with In-Play counts (Bug 3). */
  betCount?: number;
  mode?: 'interactive' | 'readonly';
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
  onArchive?: (market: Market) => void;
  isArchiving?: boolean;
  linkToEvent?: boolean;
  showRefreshAction?: boolean;
  showCloseDate?: boolean;
  /** Override the card click target. When omitted, falls back to the user
   *  event-detail path (`/events/:id`). The admin/manager Markets surface passes
   *  a role-scoped read-only detail path so clicking never hits the user route
   *  (which its RoleGuard would bounce to the Dashboard). */
  detailHref?: string;
  /** Visual treatment for the outcome pills — forwarded to OutcomeButtons.
   *  'inactive' on the admin/manager read-only surface; 'default' elsewhere. */
  outcomeAppearance?: 'default' | 'inactive';
}

function formatClosesDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const MarketCard = ({
  market,
  userBet,
  betCount,
  mode = 'interactive',
  onOutcomeClick,
  onArchive,
  isArchiving = false,
  linkToEvent = true,
  showRefreshAction = true,
  showCloseDate = true,
  detailHref,
  outcomeAppearance = 'default',
}: MarketCardProps) => {
  const { t, i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';
  const { isRefreshing, lastResult, refresh } = useMarketRefresh(
    market.polymarket_id ? [market.polymarket_id] : [],
    false
  );
  const now = useTicker(10_000);

  const isStale = market.last_synced_at
    ? now - new Date(market.last_synced_at).getTime() > MARKETS_STALE_THRESHOLD_MS
    : true;
  const effectiveStatus = getMarketEffectiveStatus(market);
  const isInteractive = mode === 'interactive' && effectiveStatus === 'open';

  // Winner tint follows resolution, not a stray winning_outcome_id on an open
  // market — see getResolvedWinnerOutcome.
  const winnerOutcome = getResolvedWinnerOutcome(market);

  // Canonical [Yes, No] order — OutcomeButtons relies on index 0 == Yes for
  // colours and the long-tail dimming. Without this, a market whose embedded
  // outcomes happened to land in [No, Yes] order would render with the
  // colours and dim treatment swapped.
  const orderedOutcomes = getOrderedOutcomes(market);
  const outcomeButtons: OutcomeButton[] = orderedOutcomes.map((o) => ({
    id: o.id,
    name: o.name,
    price: o.price,
    effectiveOdds: o.effective_odds,
    isWinner: winnerOutcome?.id === o.id,
    untradable: !o.polymarket_token_id,
  }));

  // Gauge: only meaningful for binary markets where Yes is well-defined.
  const isBinary = isBinaryMarket(market);
  const yesProbability = isBinary ? getYesProbability(market) : null;
  // Mobile shows this as a compact inline % in the title row instead of the arc
  // gauge, mirroring the EventCard outcome rows (F1 density).
  const yesPct = yesProbability != null ? formatProbability(yesProbability) : null;
  // Cards (feed + single-market event view) render outcomes at full strength.
  // Long-tail fading is reserved for the multi-market list on the event detail page.

  const volumeLabel = formatVolume(market.volume ?? null);
  const closesDate = formatClosesDate(market.close_at, i18n.language);
  const statusLabel =
    effectiveStatus !== 'open'
      ? t(`markets.status.${effectiveStatus}`, { defaultValue: effectiveStatus.toUpperCase() })
      : null;

  const cardHref =
    detailHref ?? (linkToEvent && market.event_id ? `/events/${market.event_id}` : null);

  // Shared so the mobile (compact) and desktop (full-width) outcome rows below
  // wire the exact same buy handler without duplicating logic.
  const handleOutcomeClick =
    isInteractive && onOutcomeClick
      ? (outcomeId: string) => {
          const outcome = market.market_outcomes.find((o) => o.id === outcomeId);
          if (outcome && outcome.polymarket_token_id) {
            onOutcomeClick(market, outcome);
          }
        }
      : undefined;

  return (
    <article
      className="relative flex h-full flex-col gap-2 p-2.5 transition-[transform,box-shadow] motion-reduce:transition-none hover:-translate-y-0.5 hover:[box-shadow:var(--shadow-md)] motion-reduce:hover:translate-y-0 md:gap-3 md:p-3"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        transitionDuration: 'var(--duration-base)',
        transitionTimingFunction: 'var(--ease-out-expo)',
      }}
    >
      {/* Full-card click target — any whitespace/non-interactive surface opens
          the event detail page. Absolute (no z-index) so it stacks above the
          static header content (title, gauge) and below interactive children
          marked z-10 (outcome buttons, bookmark). Header must stay non-
          positioned, otherwise a relative+z-0 header creates its own stacking
          context that paints above the overlay and swallows title clicks. */}
      {cardHref && (
        <Link
          to={cardHref}
          aria-label={t('eventDetail.open', { defaultValue: 'Open event details' })}
          className="absolute inset-0 rounded-[inherit]"
        />
      )}

      {/* Header: thumb + title on the start; probability gauge pinned to the
          inline-end so buttons below can span the full width. */}
      <header className="-mx-1 -mt-1 flex items-start gap-2.5 rounded-md p-1">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <MarketCardHeaderContent market={market} />
        </div>
        {/* Compact inline % at all widths — the arc gauge is dropped from the
            feed card entirely (F3). ChanceGauge still renders on EventDetail. */}
        {yesProbability != null && (
          <span
            className="shrink-0 self-center text-base font-semibold num"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {yesPct}
          </span>
        )}
      </header>

      {/* Outcome CTAs. Mobile: compact sm pills, right-aligned, no reserved band —
          the card collapses to content height (~160px). Desktop (md+): unchanged
          full-width xl buttons in the reserved 80px band. */}
      <div className="relative z-10 flex items-center justify-end md:hidden">
        <div className="w-[128px] shrink-0">
          <OutcomeButtons
            outcomes={outcomeButtons}
            size="sm"
            disabled={!isInteractive}
            appearance={outcomeAppearance === 'inactive' ? 'inactive' : 'fill'}
            showPercentage={false}
            hoverShowsPercentage
            onClick={handleOutcomeClick}
          />
        </div>
      </div>
      <div className="relative z-10 hidden min-h-20 grow items-center md:flex">
        <div className="min-w-0 flex-1">
          <OutcomeButtons
            outcomes={outcomeButtons}
            size="xl"
            disabled={!isInteractive}
            appearance={outcomeAppearance === 'inactive' ? 'inactive' : 'fill'}
            showPercentage={false}
            hoverShowsPercentage
            onClick={handleOutcomeClick}
          />
        </div>
      </div>

      {/* Footer: metadata as icons + compact text */}
      <footer
        className="relative flex items-center justify-between gap-3 text-xs"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <div className="flex items-center gap-3">
          {volumeLabel && (
            <span className="num">{t('markets.volumeShort', { value: volumeLabel })}</span>
          )}
          {showCloseDate && closesDate && (
            <span className="num">
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

        <div className="relative z-10 flex items-center gap-1">
          {showRefreshAction && isStale && (
            <span title={t('markets.syncedStale')} style={{ color: 'var(--color-loss)' }}>
              ⚠
            </span>
          )}
          {userBet && <BetMarker count={betCount} />}
          <BookmarkButton marketId={market.id} eventId={market.event_id} />
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
}

function MarketCardHeaderContent({ market }: MarketCardHeaderContentProps) {
  const { i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';
  const category = market.category ?? market.event?.category ?? null;

  return (
    <>
      <MarketThumbnail src={market.image_url} title={market.question} id={market.id} size="md" />
      <div className="min-w-0 flex-1">
        <h3
          className="line-clamp-2 text-sm font-semibold leading-snug"
          style={{
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-sans)',
            // Market questions come from Polymarket as English; in Hebrew UI we
            // flip the flow to LTR so punctuation/numbers land on the natural
            // side, but keep alignment to the inline-end of the card.
            ...(isHebrew && { direction: 'ltr' as const, textAlign: 'right' as const }),
          }}
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
