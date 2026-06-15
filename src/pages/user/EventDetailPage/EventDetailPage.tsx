import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ROUTES } from '@/app/router/routes';
import { useTranslation } from 'react-i18next';
import {
  useEventById,
  useMarketRefresh,
  useMyBets,
  useSimilarEvents,
  useUserBalance,
} from '@/features/bet';
import { useArchiveMarket } from '@/features/admin/markets/useArchiveMarket';
import { useAuth } from '@/shared/hooks/useAuth';
import type { Role } from '@/shared/types';
import type { Market, MarketOutcome } from '@/entities/market';
import { sortMarketsByYesDesc } from '@/entities/market';
import { BetSlip } from '@/widgets/BetSlip';
import { MarketThumbnail } from '@/shared/ui/MarketThumbnail';
import { Spinner } from '@/shared/ui/Spinner';
import { formatVolume } from '@/shared/utils';
import { SimilarEventsList } from './components/SimilarEventsList';
import { EventUserActivity } from './components/EventUserActivity';
import { SingleMarketView } from './components/SingleMarketView';
import { EventMarketRow } from './components/EventMarketRow';
import { EventPriceHistoryChart } from './components/EventPriceHistoryChart';

interface SelectedBet {
  market: Market;
  outcome: MarketOutcome;
}

interface EventDetailPageProps {
  // Read-only mode for the super-admin / manager Markets surfaces: no BetSlip,
  // no balance / user-activity, outcome pills rendered as non-bettable, and a
  // role-aware back link. Defaults to the full user betting view.
  readonly?: boolean;
}

const EventDetailPage = ({ readonly = false }: EventDetailPageProps = {}) => {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const archiveMarket = useArchiveMarket();
  const queryClient = useQueryClient();

  const { data: eventData, isLoading, isError, error } = useEventById(id);
  // Periodically refresh odds from Polymarket so the bet placement page can't be
  // gamed by checking the original site between price ticks. The edge function
  // writes fresh prices into market_outcomes; useMarketRefresh invalidates the
  // exact `['event', id]` cache key after a successful refresh so useEventById
  // immediately picks up fresh prices without a 30s lag.
  const eventPolymarketIds = (eventData?.markets ?? []).map((m) => m.polymarket_id);
  useMarketRefresh(eventPolymarketIds, { eventId: id });
  const { data: bets = [] } = useMyBets();
  const { data: balance } = useUserBalance();
  const { data: similar = [], isLoading: isSimilarLoading } = useSimilarEvents({
    eventId: eventData?.event.id,
    tagSlug: eventData?.event.tag_slug ?? null,
    category: eventData?.event.category ?? null,
  });

  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);

  const handleOutcomeClick = useCallback(
    (market: Market, outcome: MarketOutcome) => {
      setSelectedBet({ market, outcome });
    },
    [setSelectedBet]
  );

  // Archive is an admin-only action available on the read-only detail view for
  // resolved markets. Managers do not archive (mirrors the manager Markets page,
  // which never exposed it), so gate to super_admin.
  const canArchive = readonly && role === 'super_admin';
  const handleArchive = useCallback(
    (market: Market) => {
      if (!window.confirm(t('markets.archiveConfirm'))) return;
      // useArchiveMarket invalidates ['markets']; also refresh THIS event's
      // detail cache so the archived row updates immediately instead of waiting
      // for the next useEventById refetch tick.
      archiveMarket.mutate(
        { marketId: market.id },
        { onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['event', id] }) }
      );
    },
    [archiveMarket, queryClient, id, t]
  );

  // In read-only mode no betting is possible: never wire the outcome click, so
  // the BetSlip can never open and the pills stay inert.
  const outcomeClickHandler = readonly ? undefined : handleOutcomeClick;
  const cardAppearance: 'default' | 'inactive' | undefined = readonly ? 'inactive' : undefined;
  const backTo = readonly ? marketsRouteForRole(role) : ROUTES.USER.MARKETS;
  // Under the admin/manager shells the layout <main> has no padding (unlike
  // UserLayout, which wraps content in max-w-7xl mx-auto px-4 py-6). On those
  // shells the main column is usually narrower than max-w-7xl, so mx-auto adds no
  // gap and the only spacing from the sidebar is this horizontal padding — keep it
  // generous (px-6 -> lg:px-10) so content isn't flush against the sidebar.
  const rootClass = readonly ? 'mx-auto w-full max-w-7xl px-6 py-6 sm:px-8 lg:px-10' : undefined;

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !eventData) {
    return (
      <div className={rootClass}>
        <BackLink to={backTo} />
        <p className="mt-4 text-sm" style={{ color: 'var(--color-loss)' }}>
          {t('eventDetail.loadError')}
          {error?.message ? `: ${error.message}` : ''}
        </p>
      </div>
    );
  }

  const { event, markets: rawMarkets } = eventData;
  // Multi-outcome events render best with leading candidates at the top —
  // matches Polymarket's layout. Single-market events skip the sort.
  const markets = rawMarkets.length > 1 ? sortMarketsByYesDesc(rawMarkets) : rawMarkets;
  const betByMarketId = new Map(bets.map((b) => [b.market_id, b]));
  const volumeLabel = formatVolume(event.volume ?? null);
  const closesDate = event.close_at
    ? new Date(event.close_at).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const isSingleMarket = markets.length === 1;
  const isHebrew = i18n.language === 'he';

  return (
    <div className={rootClass}>
      <BackLink to={backTo} />

      <header className="mt-4 flex items-start gap-4">
        <MarketThumbnail src={event.image_url} title={event.title} id={event.id} size="lg" />
        <div className="min-w-0 flex-1">
          <div
            className={`mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium ${
              isHebrew ? '' : 'uppercase tracking-wide'
            }`}
            style={{ color: 'var(--color-text-muted)' }}
          >
            {event.category && <span>{event.category}</span>}
            <span>
              {t('events.marketCount', {
                count: markets.length,
              })}
            </span>
            {volumeLabel && <span>{t('markets.volumeShort', { value: volumeLabel })}</span>}
            {closesDate && (
              <span>
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
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-4">
        {markets.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t('eventDetail.noMarkets')}
          </p>
        ) : isSingleMarket ? (
          <SingleMarketView
            market={markets[0]}
            userBet={betByMarketId.get(markets[0].id)}
            description={event.description}
            onOutcomeClick={outcomeClickHandler}
            readonly={readonly}
            onArchive={canArchive ? handleArchive : undefined}
            isArchiving={
              archiveMarket.isPending && archiveMarket.variables?.marketId === markets[0].id
            }
          />
        ) : (
          <>
            <EventPriceHistoryChart markets={markets} />
            {event.description && (
              <section
                className="flex flex-col gap-2 p-4"
                style={{
                  backgroundColor: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                }}
              >
                <h3
                  className="text-sm font-semibold"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {t('eventDetail.rules')}
                </h3>
                <p
                  className="whitespace-pre-line text-sm leading-relaxed"
                  style={{
                    color: 'var(--color-text-secondary)',
                    // Polymarket rules text is English; LTR flow + end-aligned
                    // keeps punctuation correct inside the RTL layout.
                    ...(isHebrew && { direction: 'ltr' as const, textAlign: 'right' as const }),
                  }}
                >
                  {event.description}
                </p>
              </section>
            )}
            <section
              className="flex flex-col"
              style={{
                backgroundColor: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
              }}
            >
              {markets.map((market, idx) => (
                <EventMarketRow
                  key={market.id}
                  market={market}
                  userBet={betByMarketId.get(market.id)}
                  mode={!readonly && market.status === 'open' ? 'interactive' : 'readonly'}
                  outcomeAppearance={cardAppearance}
                  onOutcomeClick={outcomeClickHandler}
                  onArchive={canArchive ? handleArchive : undefined}
                  isArchiving={
                    archiveMarket.isPending && archiveMarket.variables?.marketId === market.id
                  }
                  isFirst={idx === 0}
                />
              ))}
            </section>
          </>
        )}

        {!readonly && <EventUserActivity markets={markets} bets={bets} />}
      </div>

      <div className="mt-10">
        <SimilarEventsList events={similar} isLoading={isSimilarLoading} />
      </div>

      {/* Keyed on market+outcome so switching outcome while the panel is open
          remounts it with fresh state (no backdrop — page stays interactive). */}
      {!readonly && selectedBet && (
        <BetSlip
          key={`${selectedBet.market.id}:${selectedBet.outcome.id}`}
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

// Read-only EventDetailPage is mounted under all three role layouts; the back
// link must return to the role's own Markets list, not the user feed.
function marketsRouteForRole(role: Role | null): string {
  switch (role) {
    case 'super_admin':
      return ROUTES.ADMIN.MARKETS;
    case 'manager':
      return ROUTES.MANAGER.MARKETS;
    default:
      return ROUTES.USER.MARKETS;
  }
}

const BackLink = ({ to }: { to: string }) => {
  const { t } = useTranslation();
  return (
    <Link
      to={to}
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
      {t('eventDetail.back')}
    </Link>
  );
};

export default EventDetailPage;
