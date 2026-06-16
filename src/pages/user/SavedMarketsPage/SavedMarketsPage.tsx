import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useMarketsByIds,
  useEventsByIds,
  useUserBalance,
  useMyBets,
  useMarketRefresh,
  groupMarketsByEvent,
} from '@/features/bet';
import type { Market, MarketOutcome } from '@/entities/market';
import { useFavoriteMarkets, useFavoriteEvents } from '@/features/favorites';
import { ROUTES } from '@/app/router/routes';
import { CardGridSkeleton } from '@/shared/ui/CardGridSkeleton';
import { MARKETS_REFRESH_MAX_IDS } from '@/shared/config/markets';
import { BalanceWidget } from '@/widgets/BalanceWidget';
import { BetSlip } from '@/widgets/BetSlip';
import { MarketCard } from '@/widgets/MarketCard';
import { EventCard } from '@/widgets/EventCard';
import { ActiveBetsDrawer } from '@/widgets/ActiveBetsDrawer';

interface SelectedBet {
  market: Market;
  outcome: MarketOutcome;
}

const SavedMarketsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { favoriteSet, isLoading: isLoadingFavMarkets } = useFavoriteMarkets();
  const { favoriteEventSet, isLoading: isLoadingFavEvents } = useFavoriteEvents();
  const savedMarketIds = Array.from(favoriteSet);
  const savedEventIds = Array.from(favoriteEventSet);

  // Standalone saved markets (not part of an event).
  const {
    data: savedStandaloneMarkets,
    isLoading: isLoadingStandalone,
    isError: isErrorStandalone,
    error: errorStandalone,
  } = useMarketsByIds(savedMarketIds, 'all', savedMarketIds.length > 0);

  // Markets belonging to saved events (rendered as event cards).
  const {
    data: savedEventMarkets,
    isLoading: isLoadingEventMarkets,
    isError: isErrorEventMarkets,
    error: errorEventMarkets,
  } = useEventsByIds(savedEventIds, 'all', savedEventIds.length > 0);

  const { data: balance } = useUserBalance();
  const { data: bets } = useMyBets();

  // Combine both sources, then group. Saved standalone markets stay as
  // market-cards (event_id is null), saved events collapse into event-cards.
  // Dedupe (Bug 4): if a market is favourited individually AND its parent
  // event is event-favourited, drop the standalone copy — it'd otherwise
  // duplicate inside the event card preview.
  const savedStandaloneFiltered = (savedStandaloneMarkets ?? []).filter(
    (m) => !m.event_id || !favoriteEventSet.has(m.event_id)
  );
  const allSavedMarkets = [...(savedEventMarkets ?? []), ...savedStandaloneFiltered];

  // Drive live odds refresh for the top N visible saved markets — same cadence
  // as the main feed (~30s).
  const polymarketIds = allSavedMarkets
    .slice(0, MARKETS_REFRESH_MAX_IDS)
    .map((m) => m.polymarket_id);
  useMarketRefresh(polymarketIds, true);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);

  const handleOutcomeClick = useCallback(
    (market: Market, outcome: MarketOutcome) => {
      setSelectedBet({ market, outcome });
    },
    [setSelectedBet]
  );

  const handleBetSuccess = () => {
    setSelectedBet(null);
  };

  const availableBalance = balance?.available ?? 0;
  const inPlay = balance?.in_play ?? 0;
  const openBetsCount = (bets ?? []).filter((b) => b.status === 'open').length;

  const userBetForMarket = (marketId: string) => (bets ?? []).find((b) => b.market_id === marketId);
  const betCountForMarket = (marketId: string) =>
    (bets ?? []).filter((b) => b.market_id === marketId).length;

  const feedItems = groupMarketsByEvent(allSavedMarkets);

  const isLoading =
    isLoadingFavMarkets ||
    isLoadingFavEvents ||
    (savedMarketIds.length > 0 && isLoadingStandalone) ||
    (savedEventIds.length > 0 && isLoadingEventMarkets);

  const isError = isErrorStandalone || isErrorEventMarkets;
  const errorMessage = errorStandalone?.message ?? errorEventMarkets?.message ?? '';

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {t('markets.savedTitle')}
      </h1>

      <BalanceWidget
        available={availableBalance}
        inPlay={inPlay}
        openBetsCount={openBetsCount}
        isLoading={!balance}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        onOpenSaved={() => navigate(ROUTES.USER.MARKETS)}
        clickableCount={feedItems.length}
      />

      {isLoading && <CardGridSkeleton count={8} />}

      {isError && (
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>
          {t('common.error')}: {errorMessage}
        </p>
      )}

      {!isLoading && !isError && feedItems.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('markets.noSaved')}
        </p>
      )}

      {!isLoading && !isError && feedItems.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {feedItems.map((item) => {
            const card =
              item.type === 'event' ? (
                <EventCard
                  event={item.event}
                  markets={item.markets}
                  bets={bets ?? []}
                  mode={item.event.status === 'archived' ? 'readonly' : 'interactive'}
                  onOutcomeClick={handleOutcomeClick}
                />
              ) : (
                <MarketCard
                  market={item.market}
                  userBet={userBetForMarket(item.market.id)}
                  betCount={betCountForMarket(item.market.id)}
                  mode={
                    item.market.status === 'open' || item.market.status === 'closed'
                      ? 'interactive'
                      : 'readonly'
                  }
                  showRefreshAction={false}
                  showCloseDate={false}
                  onOutcomeClick={handleOutcomeClick}
                />
              );
            return (
              <div
                key={item.key}
                style={{
                  contentVisibility: 'auto',
                  containIntrinsicSize: 'auto 260px',
                }}
              >
                {card}
              </div>
            );
          })}
        </div>
      )}

      {selectedBet && (
        <BetSlip
          market={selectedBet.market}
          outcome={selectedBet.outcome}
          availableBalance={availableBalance}
          onClose={() => setSelectedBet(null)}
          onSuccess={handleBetSuccess}
        />
      )}

      <ActiveBetsDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
};

export default SavedMarketsPage;
