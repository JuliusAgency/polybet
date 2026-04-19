import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Market, MarketEvent, MarketOutcome, MyBet } from '@/features/bet';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import {
  OutcomeProbabilityBar,
  type OutcomeProbabilityBarItem,
} from '@/shared/ui/OutcomeProbabilityBar';
import { MarketThumbnail } from '@/shared/ui/MarketThumbnail';
import { formatVolume } from '@/shared/utils';

const COLLAPSED_LIMIT = 6;

interface EventCardProps {
  event: MarketEvent;
  markets: Market[];
  bets?: MyBet[];
  mode?: 'interactive' | 'readonly';
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
}

function formatClosesDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(locale === 'he' ? 'he-IL' : undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const EventCard = ({
  event,
  markets,
  bets,
  mode = 'interactive',
  onOutcomeClick,
}: EventCardProps) => {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const detailPath = `/events/${event.id}`;

  const closesDate = formatClosesDate(event.close_at, i18n.language);
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

  const visibleMarkets = expanded ? markets : markets.slice(0, COLLAPSED_LIMIT);
  const canExpand = markets.length > COLLAPSED_LIMIT;

  return (
    <article
      className="flex flex-col gap-4 p-4"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {/* Header: thumb + title + description (clickable to detail) */}
      <Link
        to={detailPath}
        aria-label={t('eventDetail.open', { defaultValue: 'Open event details' })}
        className="-mx-1 -mt-1 flex items-start gap-3 rounded-md p-1 transition-colors hover:opacity-90"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        <MarketThumbnail src={event.image_url} title={event.title} id={event.id} size="lg" />

        <div className="min-w-0 flex-1">
          <h3
            className="text-base font-semibold leading-snug"
            style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            {event.title}
          </h3>
          <div
            className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-medium uppercase tracking-wide"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {event.category && <span>{event.category}</span>}
            <span>
              {t('events.marketCount', {
                count: markets.length,
                defaultValue: '{{count}} markets',
              })}
            </span>
            {volumeLabel && (
              <span className="font-mono">{t('markets.volumeShort', { value: volumeLabel })}</span>
            )}
          </div>
          {event.description && (
            <p
              className="mt-2 line-clamp-2 text-xs leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {event.description}
            </p>
          )}
        </div>
      </Link>

      {/* Market rows */}
      <div className="flex flex-col">
        {visibleMarkets.map((market, idx) => (
          <EventMarketRow
            key={market.id}
            market={market}
            userBet={betByMarketId.get(market.id)}
            mode={mode}
            onOutcomeClick={onOutcomeClick}
            isLast={idx === visibleMarkets.length - 1}
          />
        ))}
      </div>

      {/* Progressive disclosure */}
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start rounded-md px-2 py-1 text-xs font-medium transition-colors hover:opacity-80"
          style={{
            color: 'var(--color-accent)',
            transitionDuration: 'var(--duration-fast)',
            transitionTimingFunction: 'var(--ease-out-expo)',
          }}
        >
          {expanded
            ? t('markets.showLess')
            : `${t('markets.showAll')} (${markets.length - COLLAPSED_LIMIT})`}
        </button>
      )}

      {/* Footer */}
      {(closesDate || statusLabel) && (
        <footer
          className="flex items-center gap-3 text-xs"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {closesDate && (
            <span className="font-mono">
              {eventEffectiveStatus === 'open' ? t('markets.closesAt') : t('markets.closedAt')}{' '}
              {closesDate}
            </span>
          )}
          {statusLabel && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
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
        </footer>
      )}
    </article>
  );
};

interface EventMarketRowProps {
  market: Market;
  userBet: MyBet | undefined;
  mode: 'interactive' | 'readonly';
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
  isLast: boolean;
}

function EventMarketRow({ market, userBet, mode, onOutcomeClick, isLast }: EventMarketRowProps) {
  const { t } = useTranslation();

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

  const probabilityItems: OutcomeProbabilityBarItem[] = market.market_outcomes.map((o) => ({
    id: o.id,
    name: o.name,
    price: o.price,
    isWinner: winnerOutcome?.id === o.id,
  }));

  const label = market.group_label ?? market.question;
  const volumeLabel = formatVolume(market.volume ?? null);

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,300px)] items-center gap-4 py-3"
      style={{
        borderTop: isLast ? undefined : '1px solid var(--color-border-subtle)',
      }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {label}
        </p>
        <div
          className="mt-0.5 flex items-center gap-2 text-[11px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {volumeLabel && (
            <span className="font-mono">{t('markets.volumeShort', { value: volumeLabel })}</span>
          )}
          {userBet && (
            <span style={{ color: 'var(--color-accent)' }}>
              {t('markets.yourBet')}: {userBet.market_outcomes?.name ?? '—'} ·{' '}
              <span className="font-mono">{userBet.stake.toFixed(2)}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <OutcomeProbabilityBar outcomes={probabilityItems} />
        <OutcomeButtons
          outcomes={outcomeButtons}
          size="sm"
          disabled={!isInteractive}
          showPercentage={false}
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
  );
}
