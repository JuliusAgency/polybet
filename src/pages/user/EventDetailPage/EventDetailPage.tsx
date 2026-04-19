import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEventById, useMyBets, useSimilarEvents, useUserBalance } from '@/features/bet';
import type { Market, MarketOutcome } from '@/features/bet';
import { BetSlip } from '@/pages/user/MarketsFeedPage/components/BetSlip';
import { MarketThumbnail } from '@/shared/ui/MarketThumbnail';
import { Spinner } from '@/shared/ui/Spinner';
import { formatVolume } from '@/shared/utils';
import { MarketExpandable } from './components/MarketExpandable';
import { SimilarEventsList } from './components/SimilarEventsList';
import { EventUserActivity } from './components/EventUserActivity';

interface SelectedBet {
  market: Market;
  outcome: MarketOutcome;
}

const EventDetailPage = () => {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const { data: eventData, isLoading, isError, error } = useEventById(id);
  const { data: bets = [] } = useMyBets();
  const { data: balance } = useUserBalance();
  const { data: similar = [], isLoading: isSimilarLoading } = useSimilarEvents(
    eventData?.event.category ?? null,
    eventData?.event.id
  );

  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);

  const handleOutcomeClick = useCallback((market: Market, outcome: MarketOutcome) => {
    setSelectedBet({ market, outcome });
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !eventData) {
    return (
      <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
        <BackLink />
        <p className="mt-4 text-sm" style={{ color: 'var(--color-loss)' }}>
          {t('eventDetail.loadError', {
            defaultValue: 'Event not found or failed to load',
          })}
          {error?.message ? `: ${error.message}` : ''}
        </p>
      </div>
    );
  }

  const { event, markets } = eventData;
  const betByMarketId = new Map(bets.map((b) => [b.market_id, b]));
  const volumeLabel = formatVolume(event.volume ?? null);
  const closesDate = event.close_at
    ? new Date(event.close_at).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const isSingleMarket = markets.length === 1;

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      <BackLink />

      <header className="mt-4 flex items-start gap-4">
        <MarketThumbnail src={event.image_url} title={event.title} id={event.id} size="lg" />
        <div className="min-w-0 flex-1">
          <div
            className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium uppercase tracking-wide"
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
            {closesDate && (
              <span className="font-mono">
                {event.status === 'open' ? t('markets.closesAt') : t('markets.closedAt')}{' '}
                {closesDate}
              </span>
            )}
          </div>
          <h1
            className="text-2xl font-bold leading-tight"
            style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            {event.title}
          </h1>
          {event.description && (
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {event.description}
            </p>
          )}
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-4">
        <EventUserActivity markets={markets} bets={bets} />

        {markets.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t('eventDetail.noMarkets', { defaultValue: 'No markets for this event' })}
          </p>
        ) : (
          markets.map((market) => (
            <MarketExpandable
              key={market.id}
              market={market}
              userBet={betByMarketId.get(market.id)}
              defaultExpanded={isSingleMarket}
              onOutcomeClick={handleOutcomeClick}
            />
          ))
        )}
      </div>

      <div className="mt-10">
        <SimilarEventsList events={similar} isLoading={isSimilarLoading} />
      </div>

      {selectedBet && (
        <BetSlip
          market={selectedBet.market}
          outcome={selectedBet.outcome}
          availableBalance={balance?.available ?? 0}
          onClose={() => setSelectedBet(null)}
          onSuccess={() => setSelectedBet(null)}
        />
      )}
    </div>
  );
};

const BackLink = () => {
  const { t } = useTranslation();
  return (
    <Link
      to="/markets"
      className="inline-flex items-center gap-1.5 text-sm font-medium"
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
        <polyline points="15 18 9 12 15 6" />
      </svg>
      {t('eventDetail.back', { defaultValue: 'Back to markets' })}
    </Link>
  );
};

export default EventDetailPage;
