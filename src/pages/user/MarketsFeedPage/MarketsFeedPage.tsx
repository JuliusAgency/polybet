import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMarkets, useUserBalance, useMyBets } from '@/features/bet';
import type { Market, MarketOutcome, MarketStatusFilter } from '@/features/bet';
import { BetSlip } from './components/BetSlip';
import { MarketCard } from './components/MarketCard';
import { BalanceWidget } from './components/BalanceWidget';
import { ActiveBetsDrawer } from './components/ActiveBetsDrawer';
import { StatusFilter } from './components/StatusFilter';

interface SelectedBet {
  market: Market;
  outcome: MarketOutcome;
}

const MarketsFeedPage = () => {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<MarketStatusFilter>('all');
  const { data: markets, isLoading, isError, error } = useMarkets(statusFilter);
  const { data: balance } = useUserBalance();
  const { data: bets } = useMyBets();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleOutcomeClick = useCallback((market: Market, outcome: MarketOutcome) => {
    setSelectedBet({ market, outcome });
  }, []);

  const handleBetSuccess = () => {
    setSelectedBet(null);
  };

  const availableBalance = balance?.available ?? 0;
  const inPlay = balance?.in_play ?? 0;
  const openBetsCount = (bets ?? []).filter((b) => b.status === 'open').length;

  const filteredMarkets = useMemo(() => {
    if (!markets) return [];
    if (!searchQuery) return markets;
    return markets.filter((m) => m.question.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [markets, searchQuery]);

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {/* Header */}
      <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {t('markets.title')}
      </h1>

      {/* Balance widget */}
      <BalanceWidget
        available={availableBalance}
        inPlay={inPlay}
        openBetsCount={openBetsCount}
        isLoading={!balance}
        onOpenDrawer={() => setIsDrawerOpen(true)}
      />

      {/* Loading state */}
      {isLoading && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('common.loading')}
        </p>
      )}

      {/* Error state */}
      {isError && (
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>
          {t('common.error')}: {error?.message}
        </p>
      )}

      {/* Filter row: status pills + search */}
      {!isLoading && !isError && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <StatusFilter value={statusFilter} onChange={setStatusFilter} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('markets.searchPlaceholder')}
            className="rounded-full border px-3 py-1 text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-bg-elevated)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
      )}

      {/* Empty state — no markets at all */}
      {!isLoading && !isError && markets?.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('markets.noMarkets')}
        </p>
      )}

      {/* Empty state — search produced no results */}
      {!isLoading && !isError && markets && markets.length > 0 && filteredMarkets.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('common.noData')}
        </p>
      )}

      {/* Markets grid */}
      {!isLoading && !isError && filteredMarkets.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredMarkets.map((market) => (
            <MarketCard
              key={market.id}
              market={market}
              mode={
                market.status === 'open' || market.status === 'closed' ? 'interactive' : 'readonly'
              }
              onOutcomeClick={handleOutcomeClick}
            />
          ))}
        </div>
      )}

      {/* BetSlip modal */}
      {selectedBet && (
        <BetSlip
          market={selectedBet.market}
          outcome={selectedBet.outcome}
          availableBalance={availableBalance}
          inPlay={inPlay}
          onClose={() => setSelectedBet(null)}
          onSuccess={handleBetSuccess}
        />
      )}
      {/* Active bets drawer */}
      <ActiveBetsDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
};

export default MarketsFeedPage;
