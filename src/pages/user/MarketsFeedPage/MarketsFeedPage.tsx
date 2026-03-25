import { useState, useEffect, useMemo, useCallback } from 'react';
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
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-dismiss success banner after 3 seconds
  useEffect(() => {
    if (!showSuccessBanner) return;

    const timer = setTimeout(() => {
      setShowSuccessBanner(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [showSuccessBanner]);

  const handleOutcomeClick = useCallback((market: Market, outcome: MarketOutcome) => {
    setSelectedBet({ market, outcome });
  }, []);

  const handleBetSuccess = () => {
    setSelectedBet(null);
    setShowSuccessBanner(true);
  };

  const availableBalance = balance?.available ?? 0;

  // Derive unique categories from loaded markets
  const categories = useMemo(() => {
    if (!markets) return [];
    const unique = new Set(markets.map((m) => m.category).filter(Boolean));
    return Array.from(unique) as string[];
  }, [markets]);

  // Filter markets client-side by category and search query
  const filteredMarkets = useMemo(() => {
    if (!markets) return [];
    return markets.filter((m) => {
      const matchesCategory = !selectedCategory || m.category === selectedCategory;
      const matchesSearch =
        !searchQuery || m.question.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [markets, selectedCategory, searchQuery]);

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

      {/* Filter bar — shown when data is loaded without errors */}
      {!isLoading && !isError && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('')}
              className="rounded-full px-3 py-1 text-sm font-medium transition-colors"
              style={{
                backgroundColor: !selectedCategory
                  ? 'var(--color-accent)'
                  : 'var(--color-bg-elevated)',
                color: !selectedCategory
                  ? 'var(--color-bg-base)'
                  : 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              {t('markets.filterAll')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
                className="rounded-full px-3 py-1 text-sm font-medium transition-colors"
                style={{
                  backgroundColor:
                    selectedCategory === cat
                      ? 'var(--color-accent)'
                      : 'var(--color-bg-elevated)',
                  color:
                    selectedCategory === cat
                      ? 'var(--color-bg-base)'
                      : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('markets.searchPlaceholder')}
            className="rounded-lg border px-3 py-1.5 text-sm outline-none"
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

      {/* Empty state — filters produced no results */}
      {!isLoading &&
        !isError &&
        markets &&
        markets.length > 0 &&
        filteredMarkets.length === 0 && (
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
          onClose={() => setSelectedBet(null)}
          onSuccess={handleBetSuccess}
        />
      )}
    </div>
  );
};

export default MarketsFeedPage;
