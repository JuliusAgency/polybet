import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Market, MarketEvent, MarketOutcome, MyBet } from '@/features/bet';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import { MarketThumbnail } from '@/shared/ui/MarketThumbnail';
import { BookmarkButton } from '@/shared/ui/BookmarkButton';
import { ChanceGauge } from '@/shared/ui/ChanceGauge';
import { BetMarker } from '@/shared/ui/BetMarker';
import { formatVolume } from '@/shared/utils';

// Polymarket-style: at most 2 outcome rows visible in the feed card.
// Users drill into /events/:id to see the full list — no inline expansion.
const VISIBLE_MARKET_LIMIT = 2;

interface EventCardProps {
  event: MarketEvent;
  markets: Market[];
  bets?: MyBet[];
  mode?: 'interactive' | 'readonly';
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
}

export const EventCard = ({
  event,
  markets,
  bets,
  mode = 'interactive',
  onOutcomeClick,
}: EventCardProps) => {
  const { t, i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';
  const detailPath = `/events/${event.id}`;

  const volumeLabel = formatVolume(event.volume ?? null);
  const betByMarketId = new Map((bets ?? []).map((b) => [b.market_id, b]));

  const eventExpired = event.close_at != null && new Date(event.close_at).getTime() <= Date.now();
  const eventEffectiveStatus = eventExpired && event.status === 'open' ? 'closed' : event.status;

  const statusLabel =
    eventEffectiveStatus !== 'open'
      ? t(`markets.status.${eventEffectiveStatus}`, {
          defaultValue: eventEffectiveStatus.toUpperCase(),
        })
      : null;

  // Strict VISIBLE_MARKET_LIMIT cap, but bet markets take priority over the
  // default sort so a user's wagered market is never buried — if they have
  // bets across more than the limit, only the top-N bet markets fit; the
  // full list stays reachable via the event detail page.
  const betMarkets = markets.filter((m) => betByMarketId.has(m.id));
  const nonBetMarkets = markets.filter((m) => !betByMarketId.has(m.id));
  const visibleMarkets = [...betMarkets, ...nonBetMarkets].slice(0, VISIBLE_MARKET_LIMIT);
  // Pick the most liquid market as the bookmark anchor (same rule
  // the feed uses to pick the primary market for an event).
  const primaryMarket = markets.find((m) => (m.volume ?? 0) > 0) ?? markets[0] ?? null;
  const isSingle = visibleMarkets.length === 1;
  const singleMarket = isSingle ? visibleMarkets[0] : null;

  const singleIsExpired =
    singleMarket?.close_at != null && new Date(singleMarket.close_at).getTime() <= Date.now();
  const singleEffectiveStatus =
    singleMarket && singleIsExpired && singleMarket.status === 'open'
      ? 'closed'
      : (singleMarket?.status ?? null);
  const singleIsInteractive =
    !!singleMarket &&
    mode === 'interactive' &&
    singleEffectiveStatus === 'open' &&
    !singleIsExpired;
  const singleWinner = singleMarket?.winning_outcome_id
    ? (singleMarket.market_outcomes.find((o) => o.id === singleMarket.winning_outcome_id) ?? null)
    : null;
  const singleOutcomeButtons: OutcomeButton[] = singleMarket
    ? singleMarket.market_outcomes.map((o) => ({
        id: o.id,
        name: o.name,
        price: o.price,
        effectiveOdds: o.effective_odds,
        isWinner: singleWinner?.id === o.id,
      }))
    : [];
  const singleYes = singleMarket?.market_outcomes[0];
  // Arc gauge only applies to binary markets (see MarketCard rationale).
  const singleIsBinary = (singleMarket?.market_outcomes.length ?? 0) === 2;
  const singleYesProbability = singleIsBinary && singleYes?.price != null ? singleYes.price : null;

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
        <Link
          to={detailPath}
          aria-label={t('eventDetail.open', { defaultValue: 'Open event details' })}
          className="group/title flex min-w-0 flex-1 items-start gap-2.5"
        >
          <MarketThumbnail src={event.image_url} title={event.title} id={event.id} size="md" />

          <div className="min-w-0 flex-1">
            <h3
              className="line-clamp-2 text-sm font-semibold leading-snug underline-offset-2 decoration-1 group-hover/title:underline"
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
        </Link>
        {singleYesProbability != null && (
          <div className="shrink-0">
            <ChanceGauge value={singleYesProbability} size={64} />
          </div>
        )}
      </header>

      {/* Body: single market → full-width buttons (gauge is in header); multi → compact rows */}
      {singleMarket ? (
        <div className="flex min-h-20 items-center">
          <div className="min-w-0 flex-1">
            <OutcomeButtons
              outcomes={singleOutcomeButtons}
              size="xl"
              disabled={!singleIsInteractive}
              showPercentage={false}
              hoverShowsPercentage
              onClick={
                singleIsInteractive && onOutcomeClick
                  ? (outcomeId) => {
                      const outcome = singleMarket.market_outcomes.find((o) => o.id === outcomeId);
                      if (outcome) onOutcomeClick(singleMarket, outcome);
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
              detailPath={detailPath}
            />
          ))}
        </div>
      )}

      {/* Footer: meta + bookmark */}
      <footer
        className="flex items-center justify-between gap-3 text-xs"
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
        <div className="flex items-center gap-1">
          {betMarkets.length > 0 && <BetMarker />}
          {primaryMarket && <BookmarkButton marketId={primaryMarket.id} stopPropagation={false} />}
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
  detailPath: string;
}

function EventMarketRow({
  market,
  userBet,
  mode,
  onOutcomeClick,
  detailPath,
}: EventMarketRowProps) {
  const { t, i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';

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

  const label = market.group_label ?? market.question;
  const yesOutcome = market.market_outcomes[0];
  const yesPct = yesOutcome?.price != null ? `${Math.round(yesOutcome.price * 100)}%` : null;

  return (
    <div className="group/row relative flex items-center gap-3 py-1.5">
      {/* Full-row click target — covers label, pct, and whitespace */}
      <Link to={detailPath} aria-label={label} className="absolute inset-0 rounded" />

      <span
        className="min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-snug underline-offset-2 decoration-1 group-hover/row:underline"
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

      {userBet && (
        <span
          className="relative z-10 shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium"
          style={{
            color: 'var(--color-accent)',
            backgroundColor: 'color-mix(in oklch, var(--color-accent) 10%, transparent)',
            border: '1px solid color-mix(in oklch, var(--color-accent) 30%, transparent)',
          }}
          title={`${t('markets.yourBet')}: ${userBet.market_outcomes?.name ?? '—'} ${userBet.stake.toFixed(2)} → ${userBet.potential_payout.toFixed(2)}`}
        >
          {userBet.market_outcomes?.name ?? '●'} · {userBet.stake.toFixed(0)}
        </span>
      )}
    </div>
  );
}
