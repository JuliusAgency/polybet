import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMarkets, useUserBalance } from '@/features/bet';
import type { Market, MarketOutcome } from '@/features/bet';
import { BetSlip } from './components/BetSlip';
import { MarketCard } from './components/MarketCard';

interface SelectedBet {
  market: Market;
  outcome: MarketOutcome;
}

const MarketsFeedPage = () => {
  const { t } = useTranslation();
  const { data: markets, isLoading, isError, error } = useMarkets();
  const { data: balance } = useUserBalance();

  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);

  // Auto-dismiss success banner after 3 seconds
  useEffect(() => {
    if (!showSuccessBanner) return;

    const timer = setTimeout(() => {
      setShowSuccessBanner(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [showSuccessBanner]);

  const handleOutcomeClick = (market: Market, outcome: MarketOutcome) => {
    setSelectedBet({ market, outcome });
  };

  const handleBetSuccess = () => {
    setSelectedBet(null);
    setShowSuccessBanner(true);
  };

  const availableBalance = balance?.available ?? 0;

  return (
    <div
      className="min-h-screen p-6"
      style={{ backgroundColor: 'var(--color-bg-base)' }}
    >
      {/* Header */}
      <h1
        className="mb-6 text-2xl font-bold"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {t('markets.title')}
      </h1>

      {/* Success banner */}
      {showSuccessBanner && (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm font-medium"
          style={{
            color: 'var(--color-win)',
            backgroundColor: 'var(--color-win-muted)',
            border: '1px solid var(--color-win)',
          }}
        >
          {t('markets.betPlaced')}
        </div>
      )}

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

      {/* Empty state */}
      {!isLoading && !isError && markets?.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('markets.noMarkets')}
        </p>
      )}

      {/* Markets grid */}
      {!isLoading && !isError && markets && markets.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {markets.map((market) => (
            <MarketCard
              key={market.id}
              market={market}
              onOutcomeClick={(outcome) => handleOutcomeClick(market, outcome)}
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
          onClose={() => setSelectedBet(null)}
          onSuccess={handleBetSuccess}
        />
      )}
    </div>
  );
};

export default MarketsFeedPage;
