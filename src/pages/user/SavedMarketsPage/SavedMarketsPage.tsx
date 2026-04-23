import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useMarketsByIds,
  useUserBalance,
  useMyBets,
  useMarketRefresh,
  groupMarketsByEvent,
} from '@/features/bet';
import type { Market, MarketOutcome } from '@/features/bet';
import { useFavoriteMarkets } from '@/features/favorites';
import { ROUTES } from '@/app/router/routes';
import { CardGridSkeleton } from '@/shared/ui/CardGridSkeleton';
import { MARKETS_REFRESH_MAX_IDS } from '@/shared/config/markets';
import { BalanceWidget } from '../MarketsFeedPage/components/BalanceWidget';
import { BetSlip } from '../MarketsFeedPage/components/BetSlip';
import { MarketCard } from '../MarketsFeedPage/components/MarketCard';
import { EventCard } from '../MarketsFeedPage/components/EventCard';
import { ActiveBetsDrawer } from '../MarketsFeedPage/components/ActiveBetsDrawer';

interface SelectedBet {
  market: Market;
  outcome: MarketOutcome;
}

const SavedMarketsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { favoriteSet, isLoading: isLoadingFavorites } = useFavoriteMarkets();
  const savedIds = Array.from(favoriteSet);

  const {
    data: savedMarkets,
    isLoading: isLoadingMarkets,
    isError,
    error,
  } = useMarketsByIds(savedIds, 'all', savedIds.length > 0);

  const { data: balance } = useUserBalance();
  const { data: bets } = useMyBets();

  // Drive live odds refresh for the top N visible saved markets, same cadence
  // as the main feed (~30s). Auto-enabled so cards stay in sync without the
  // user having to navigate away and back.
  const polymarketIds = (savedMarkets ?? [])
    .slice(0, MARKETS_REFRESH_MAX_IDS)
    .map((m) => m.polymarket_id);
  useMarketRefresh(polymarketIds, true);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);

  const handleOutcomeClick = useCallback((market: Market, outcome: MarketOutcome) => {
    setSelectedBet({ market, outcome });
  }, []);

  const handleBetSuccess = () => {
    setSelectedBet(null);
  };

  const availableBalance = balance?.available ?? 0;
  const inPlay = balance?.in_play ?? 0;
  const openBetsCount = (bets ?? []).filter((b) => b.status === 'open').length;

  const userBetForMarket = (marketId: string) => (bets ?? []).find((b) => b.market_id === marketId);

  const feedItems = groupMarketsByEvent(savedMarkets ?? []);

  const isLoading = isLoadingFavorites || (savedIds.length > 0 && isLoadingMarkets);

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
        savedCount={favoriteSet.size}
      />

      {isLoading && <CardGridSkeleton count={6} />}

      {isError && (
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>
          {t('common.error')}: {error?.message}
        </p>
      )}

      {!isLoading && !isError && feedItems.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('markets.noSaved')}
        </p>
      )}

      {!isLoading && !isError && feedItems.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
