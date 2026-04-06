import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMarkets, useMarketCategories } from '@/features/bet';
import type { Market, MarketStatusFilter } from '@/features/bet';
import { useArchiveMarket } from '@/features/admin/markets/useArchiveMarket';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { useIntersectionObserver } from '@/shared/hooks/useIntersectionObserver';
import { MarketCard } from '@/pages/user/MarketsFeedPage/components/MarketCard';
import { StatusFilter } from '@/pages/user/MarketsFeedPage/components/StatusFilter';
import { CategoryFilter } from '@/pages/user/MarketsFeedPage/components/CategoryFilter';
import { CardGridSkeleton } from '@/shared/ui/CardGridSkeleton';
import { Spinner } from '@/shared/ui/Spinner';

const MarketsPage = () => {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<MarketStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: categories = [] } = useMarketCategories();

  const { markets, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMarkets(statusFilter, debouncedSearch, categoryFilter);

  const archiveMarket = useArchiveMarket();

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const handleLoadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  useIntersectionObserver(sentinelRef, handleLoadMore, !!hasNextPage && !isFetchingNextPage);

  const handleArchive = (market: Market) => {
    if (!window.confirm(t('markets.archiveConfirm'))) return;
    archiveMarket.mutate({ marketId: market.id });
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {t('markets.title')}
      </h1>

      {/* Filters */}
      <div className="mb-4">
        {/* Row: status pills + search */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusFilter value={statusFilter} onChange={setStatusFilter} />
          <div className="relative flex items-center">
            <div
              className="pointer-events-none absolute inset-y-0 flex items-center"
              style={{ insetInlineStart: '10px' }}
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
                style={{ color: 'var(--color-text-muted)' }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('markets.searchPlaceholder')}
              className="rounded-full border py-1 text-sm outline-none"
              style={{
                backgroundColor: 'var(--color-bg-elevated)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
                paddingInlineStart: '2rem',
                paddingInlineEnd: '0.75rem',
              }}
            />
          </div>
        </div>
        {/* Category filter — below status row */}
        <CategoryFilter
          value={categoryFilter}
          onChange={setCategoryFilter}
          categories={categories}
        />
      </div>

      {isLoading && <CardGridSkeleton count={4} />}

      {isError && (
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>
          {t('common.error')}: {error?.message}
        </p>
      )}

      {!isLoading && !isError && markets.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {debouncedSearch ? t('markets.noResults') : t('markets.noMarkets')}
        </p>
      )}

      {!isLoading && !isError && markets.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {markets.map((market) => (
            <MarketCard
              key={market.id}
              market={market}
              mode="readonly"
              onArchive={handleArchive}
              isArchiving={
                archiveMarket.isPending && archiveMarket.variables?.marketId === market.id
              }
            />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-4" />

      {isFetchingNextPage && (
        <div className="mt-4 flex justify-center">
          <Spinner size="sm" />
        </div>
      )}

      {!hasNextPage && markets.length > 0 && !isLoading && (
        <p className="mt-4 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('markets.allLoaded')}
        </p>
      )}
    </div>
  );
};

export default MarketsPage;
