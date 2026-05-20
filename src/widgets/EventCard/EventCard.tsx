import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Market, MarketOutcome } from '@/entities/market';
import {
  getMarketEffectiveStatus,
  getOrderedOutcomes,
  getYesProbability,
  sortMarketsByYesDesc,
} from '@/entities/market';
import type { MarketEvent } from '@/entities/event';
import { getEventEffectiveStatus } from '@/entities/event';
import type { MyBet } from '@/entities/bet';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import { MarketThumbnail } from '@/shared/ui/MarketThumbnail';
import { EventBookmarkButton } from '@/shared/ui/EventBookmarkButton';
import { ChanceGauge } from '@/shared/ui/ChanceGauge';
import { BetMarker } from '@/shared/ui/BetMarker';
import { formatVolume, formatProbability } from '@/shared/utils';

// Polymarket-style: at most 2 outcome rows visible in the feed card.
// Users drill into /events/:id to see the full list — no inline expansion.
const FEED_VISIBLE_LIMIT = 2;

export interface EventCardProps {
  event: MarketEvent;
  markets: Market[];
  bets?: MyBet[];
  mode?: 'interactive' | 'readonly';
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
  // When true, always render as a multi-row event card even if only one
  // market is passed in. Used by the "my bets" filter: there we only pass
  // the user's wagered markets, so a multi-market event would otherwise
  // collapse into the single-market visual just because the other rows
  // are filtered out.
  forceMultiRow?: boolean;
  // Total number of markets this event has across all statuses (incl. closed).
  // Drives the same "don't collapse to single" rule for events that originally
  // had many candidate markets but where all but one have since resolved —
  // a Yes/No on "GPT-5.5 released by…?" is meaningless, the question is a
  // multi-choice over date candidates.
  // When undefined, falls back to the legacy `visibleMarkets.length === 1`
  // collapse rule for back-compat with consumers that don't yet pass it.
  totalMarketsCount?: number;
}

export const EventCard = ({
  event,
  markets,
  bets,
  mode = 'interactive',
  onOutcomeClick,
  forceMultiRow = false,
  totalMarketsCount,
}: EventCardProps) => {
  const { t, i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';
  const detailPath = `/events/${event.id}`;

  const volumeLabel = formatVolume(event.volume ?? null);
  // Group bets by market_id (a user can place multiple bets on the same
  // market — Bug 3). The first entry is used wherever a single bet is
  // needed; the array length feeds the BetMarker count badge.
  const betsByMarketId = new Map<string, MyBet[]>();
  for (const b of bets ?? []) {
    const arr = betsByMarketId.get(b.market_id);
    if (arr) arr.push(b);
    else betsByMarketId.set(b.market_id, [b]);
  }
  const betByMarketId = new Map(
    Array.from(betsByMarketId.entries(), ([id, list]) => [id, list[0]] as const)
  );

  const eventEffectiveStatus = getEventEffectiveStatus(event);

  const statusLabel =
    eventEffectiveStatus !== 'open'
      ? t(`markets.status.${eventEffectiveStatus}`, {
          defaultValue: eventEffectiveStatus.toUpperCase(),
        })
      : null;

  // Order: user's bets first (so In-Play context surfaces), then the remaining
  // markets sorted by Yes-probability DESC (Polymarket-style — leading
  // candidates float to the top of the preview block, eliminated outcomes
  // sink). Stable sort keeps multi-market events visually predictable.
  const betMarkets = markets.filter((m) => betByMarketId.has(m.id));
  const nonBetMarkets = sortMarketsByYesDesc(markets.filter((m) => !betByMarketId.has(m.id)));
  const orderedMarkets = [...betMarkets, ...nonBetMarkets];
  const visibleMarkets = orderedMarkets.slice(0, FEED_VISIBLE_LIMIT);

  // Collapse to the single-market visual ONLY when the event truly has just
  // one market in total. If the event originally had multiple candidate markets
  // and the rest have since closed/resolved (leaving one open), we still want
  // the multi-row event layout — a Yes/No on a multi-choice question reads as
  // a bug. `totalMarketsCount === undefined` keeps the legacy behavior for
  // consumers that don't pass the count yet.
  const knownTotal = totalMarketsCount;
  const isSingle =
    !forceMultiRow && visibleMarkets.length === 1 && (knownTotal === undefined || knownTotal <= 1);
  const hiddenClosedCount =
    knownTotal !== undefined && knownTotal > orderedMarkets.length
      ? knownTotal - orderedMarkets.length
      : 0;
  const singleMarket = isSingle ? visibleMarkets[0] : null;

  const singleIsExpired =
    singleMarket?.close_at != null && new Date(singleMarket.close_at).getTime() <= Date.now();
  const singleEffectiveStatus = singleMarket ? getMarketEffectiveStatus(singleMarket) : null;
  const singleIsInteractive =
    !!singleMarket &&
    mode === 'interactive' &&
    singleEffectiveStatus === 'open' &&
    !singleIsExpired;
  const singleWinner = singleMarket?.winning_outcome_id
    ? (singleMarket.market_outcomes.find((o) => o.id === singleMarket.winning_outcome_id) ?? null)
    : null;
  // Canonical [Yes, No] ordering — see MarketCard rationale.
  const singleOrderedOutcomes = singleMarket ? getOrderedOutcomes(singleMarket) : [];
  const singleOutcomeButtons: OutcomeButton[] = singleOrderedOutcomes.map((o) => ({
    id: o.id,
    name: o.name,
    price: o.price,
    effectiveOdds: o.effective_odds,
    isWinner: singleWinner?.id === o.id,
    untradable: !o.polymarket_token_id,
  }));
  const singleYesProbability = singleMarket ? getYesProbability(singleMarket) : null;
  // Feed cards never dim outcomes — long-tail fading is reserved for the event
  // detail page list, where <1% sub-markets sink to the bottom but stay readable.

  return (
    <article
      className="group/card relative flex flex-col gap-3 p-3 transition-[transform,box-shadow] motion-reduce:transition-none hover:-translate-y-0.5 hover:[box-shadow:var(--shadow-md)] motion-reduce:hover:translate-y-0"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        transitionDuration: 'var(--duration-base)',
        transitionTimingFunction: 'var(--ease-out-expo)',
      }}
    >
      {/* Full-card click target — any whitespace/non-interactive surface opens
          the event detail page. The Link is absolute (no z-index) so it
          stacks above static header content (title, gauge) and below
          explicitly-z-10 interactive children (outcome buttons, bookmark).
          Header must NOT be position:relative or it will create a stacking
          context that paints above the overlay and swallow title clicks. */}
      <Link
        to={detailPath}
        aria-label={t('eventDetail.open', { defaultValue: 'Open event details' })}
        className="absolute inset-0 rounded-[inherit]"
      />

      {/* Header: thumb + title on the start; probability gauge pinned to the
          inline-end so buttons below can span the full width. */}
      <header className="-mx-1 -mt-1 flex items-start gap-2.5 rounded-md p-1">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <MarketThumbnail src={event.image_url} title={event.title} id={event.id} size="md" />

          <div className="min-w-0 flex-1">
            <h3
              className="line-clamp-2 text-sm font-semibold leading-snug underline-offset-2 decoration-1 group-hover/card:underline"
              style={{
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)',
                // Event titles come from Polymarket as English; LTR flow fixes
                // punctuation placement inside the Hebrew layout while keeping
                // the block aligned to the inline-end edge.
                ...(isHebrew && { direction: 'ltr' as const, textAlign: 'right' as const }),
              }}
            >
              {event.title}
            </h3>
          </div>
        </div>
        {singleYesProbability != null && (
          <div className="shrink-0">
            <ChanceGauge value={singleYesProbability} size={64} />
          </div>
        )}
      </header>

      {/* Body: single market → full-width buttons (gauge is in header); multi → compact rows */}
      {singleMarket ? (
        <div className="relative z-10 flex min-h-20 items-center">
          <div className="min-w-0 flex-1">
            <OutcomeButtons
              outcomes={singleOutcomeButtons}
              size="xl"
              disabled={!singleIsInteractive}
              showPercentage={false}
              hoverShowsPercentage
              longTail={false}
              onClick={
                singleIsInteractive && onOutcomeClick
                  ? (outcomeId) => {
                      const outcome = singleMarket.market_outcomes.find((o) => o.id === outcomeId);
                      if (outcome && outcome.polymarket_token_id) {
                        onOutcomeClick(singleMarket, outcome);
                      }
                    }
                  : undefined
              }
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {visibleMarkets.map((market) => (
            <EventMarketRow
              key={market.id}
              market={market}
              userBet={betByMarketId.get(market.id)}
              mode={mode}
              onOutcomeClick={onOutcomeClick}
            />
          ))}
          {hiddenClosedCount > 0 && (
            <span className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t('events.closedMarkets', { count: hiddenClosedCount })}
            </span>
          )}
        </div>
      )}

      {/* Footer: meta + action */}
      <footer
        className="relative flex items-center justify-between gap-3 text-xs"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {volumeLabel && (
            <span className="font-mono">{t('markets.volumeShort', { value: volumeLabel })}</span>
          )}
          {statusLabel && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isHebrew ? '' : 'uppercase tracking-wide'
              }`}
              style={{
                backgroundColor: `color-mix(in oklch, var(--color-${eventEffectiveStatus === 'resolved' ? 'resolved' : 'text-secondary'}) 14%, transparent)`,
                color:
                  eventEffectiveStatus === 'resolved'
                    ? 'var(--color-resolved)'
                    : 'var(--color-text-secondary)',
              }}
            >
              {statusLabel}
            </span>
          )}
        </div>
        <div className="relative z-10 flex items-center gap-1">
          {betMarkets.length > 0 && (
            <BetMarker
              count={betMarkets.reduce(
                (sum, m) => sum + (betsByMarketId.get(m.id)?.length ?? 0),
                0
              )}
            />
          )}
          <EventBookmarkButton eventId={event.id} stopPropagation={false} />
        </div>
      </footer>
    </article>
  );
};

interface EventMarketRowProps {
  market: Market;
  userBet: MyBet | undefined;
  mode: 'interactive' | 'readonly';
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
}

function EventMarketRow({ market, mode, onOutcomeClick }: EventMarketRowProps) {
  const { i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';

  const isExpired = market.close_at != null && new Date(market.close_at).getTime() <= Date.now();
  const effectiveStatus = getMarketEffectiveStatus(market);
  const isInteractive = mode === 'interactive' && effectiveStatus === 'open' && !isExpired;

  const winnerOutcome = market.winning_outcome_id
    ? (market.market_outcomes.find((o) => o.id === market.winning_outcome_id) ?? null)
    : null;

  const orderedOutcomes = getOrderedOutcomes(market);
  const outcomeButtons: OutcomeButton[] = orderedOutcomes.map((o) => ({
    id: o.id,
    name: o.name,
    price: o.price,
    effectiveOdds: o.effective_odds,
    isWinner: winnerOutcome?.id === o.id,
    untradable: !o.polymarket_token_id,
  }));

  const label = market.group_label ?? market.question;
  const yesPrice = getYesProbability(market);
  const yesPct = yesPrice != null ? formatProbability(yesPrice) : null;
  // Feed rows render outcomes at full strength — see EventCard rationale above.

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className="min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-snug underline-offset-2 decoration-1 group-hover/card:underline"
        style={{
          color: 'var(--color-text-primary)',
          ...(isHebrew && { direction: 'ltr' as const, textAlign: 'right' as const }),
        }}
      >
        {label}
      </span>

      {yesPct && (
        <span
          className="shrink-0 text-sm font-semibold tabular-nums"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {yesPct}
        </span>
      )}

      <div className="relative z-10 w-[128px] shrink-0">
        <OutcomeButtons
          outcomes={outcomeButtons}
          size="sm"
          disabled={!isInteractive}
          showPercentage={false}
          hoverShowsPercentage
          longTail={false}
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
    </div>
  );
}
