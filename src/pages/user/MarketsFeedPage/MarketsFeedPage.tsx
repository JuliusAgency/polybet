import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMarkets,
  useUserBalance,
  useMyBets,
  useAllowedCategoryTags,
  groupMarketsByEvent,
} from '@/features/bet';
import type { Market, MarketOutcome, MarketStatusFilter } from '@/features/bet';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { useIntersectionObserver } from '@/shared/hooks/useIntersectionObserver';
import { Spinner } from '@/shared/ui/Spinner';
import { CardGridSkeleton } from '@/shared/ui/CardGridSkeleton';
import { BetSlip } from './components/BetSlip';
import { MarketCard } from './components/MarketCard';
import { EventCard } from './components/EventCard';
import { BalanceWidget } from './components/BalanceWidget';
import { ActiveBetsDrawer } from './components/ActiveBetsDrawer';
import { StatusFilter } from './components/StatusFilter';
import { TagFilter } from './components/TagFilter';

interface SelectedBet {
  market: Market;
  outcome: MarketOutcome;
}

const MarketsFeedPage = () => {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<MarketStatusFilter>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [tagSlug, setTagSlug] = useState<string | null>('trending');
  const [myBetsOnly, setMyBetsOnly] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: allowedTags = [] } = useAllowedCategoryTags();

  const { markets, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMarkets(statusFilter, debouncedSearch, null, tagSlug);

  const { data: balance } = useUserBalance();
  const { data: bets } = useMyBets();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleLoadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  useIntersectionObserver(sentinelRef, handleLoadMore, !!hasNextPage && !isFetchingNextPage);

  const handleOutcomeClick = useCallback((market: Market, outcome: MarketOutcome) => {
    setSelectedBet({ market, outcome });
  }, []);

  const handleBetSuccess = () => {
    setSelectedBet(null);
  };

  const availableBalance = balance?.available ?? 0;
  const inPlay = balance?.in_play ?? 0;
  const openBetsCount = (bets ?? []).filter((b) => b.status === 'open').length;

  const myBetMarketIds = new Set((bets ?? []).map((b) => b.market_id));
  const hasBets = myBetMarketIds.size > 0;

  const userBetForMarket = (marketId: string) => (bets ?? []).find((b) => b.market_id === marketId);

  // Mirror UI's effectiveStatus rule (see MarketCard/EventCard): a record counts
  // as "open" only if its own status is open, its close_at is in the future, and —
  // for markets attached to an event — the parent event is also effectively open.
  const filteredByStatus =
    statusFilter === 'open'
      ? markets.filter((m) => {
          if (!m.event) return true;
          const ev = m.event;
          if (ev.status !== 'open') return false;
          if (ev.close_at != null && new Date(ev.close_at).getTime() <= Date.now()) return false;
          return true;
        })
      : markets;

  const visibleMarkets = myBetsOnly
    ? filteredByStatus.filter((m) => myBetMarketIds.has(m.id))
    : filteredByStatus;
  const feedItems = groupMarketsByEvent(visibleMarkets);

  return (
    <div>
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

      {/* Filters */}
      <div className="mb-4">
        {/* Row: status pills + my-bets toggle + search */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusFilter value={statusFilter} onChange={setStatusFilter} />
          </div>
          <div className="flex items-center gap-2">
            {hasBets && (
              <button
                onClick={() => setMyBetsOnly((v) => !v)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-all"
                style={{
                  backgroundColor: myBetsOnly ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                  color: myBetsOnly ? '#fff' : 'var(--color-text-secondary)',
                  border: `1px solid ${myBetsOnly ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  boxShadow: myBetsOnly ? '0 0 0 2px var(--color-accent-muted)' : 'none',
                  cursor: 'pointer',
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill={myBetsOnly ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                {t('markets.myBetsOnly')}
              </button>
            )}
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
        </div>
        {/* Tag filter — curated popular categories from Polymarket */}
        <TagFilter value={tagSlug} onChange={setTagSlug} tags={allowedTags} />
      </div>

      {/* Loading state — initial load */}
      {isLoading && <CardGridSkeleton count={6} />}

      {/* Error state */}
      {isError && (
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>
          {t('common.error')}: {error?.message}
        </p>
      )}

      {/* Empty state — no markets at all */}
      {!isLoading && !isError && feedItems.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {debouncedSearch ? t('markets.noResults') : t('markets.noMarkets')}
        </p>
      )}

      {/* Feed grid: events grouped + standalone markets */}
      {!isLoading && !isError && feedItems.length > 0 && (
        <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                className="h-full"
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

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />

      {/* Loading next page */}
      {isFetchingNextPage && (
        <div className="mt-4 flex justify-center">
          <Spinner size="sm" />
        </div>
      )}

      {/* All pages loaded */}
      {!hasNextPage && markets.length > 0 && !isLoading && (
        <p className="mt-4 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('markets.allLoaded')}
        </p>
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

      {/* Active bets drawer */}
      <ActiveBetsDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
};

export default MarketsFeedPage;
