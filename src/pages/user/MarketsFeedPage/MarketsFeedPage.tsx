import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMarkets,
  useMarketsByIds,
  useEventsByIds,
  useUserBalance,
  useMyBets,
  useAllowedCategoryTags,
  useEventMarketCounts,
  groupMarketsByEvent,
} from '@/features/bet';
import { useFavoriteMarkets, useFavoriteEvents } from '@/features/favorites';
import type { Market, MarketOutcome } from '@/entities/market';
import type { MarketStatusFilter } from '@/entities/market';
import { isMarketEffectivelyOpen } from '@/entities/market';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { useIntersectionObserver } from '@/shared/hooks/useIntersectionObserver';
import { Spinner } from '@/shared/ui/Spinner';
import { CardGridSkeleton } from '@/shared/ui/CardGridSkeleton';
import { BetSlip } from '@/widgets/BetSlip';
import { MarketCard } from '@/widgets/MarketCard';
import { EventCard } from '@/widgets/EventCard';
import { StatusFilter } from '@/widgets/StatusFilter';
import { WorldCupHero } from '@/widgets/WorldCupHero';
import { TagFilter } from './components/TagFilter';

interface SelectedBet {
  market: Market;
  outcome: MarketOutcome;
}

const MarketsFeedPage = () => {
  const { t } = useTranslation();
  const { favoriteSet } = useFavoriteMarkets();
  const { favoriteEventSet } = useFavoriteEvents();
  const [statusFilter, setStatusFilter] = useState<MarketStatusFilter>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [tagSlug, setTagSlug] = useState<string | null>('trending');
  const [myBetsOnly, setMyBetsOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: allowedTags = [] } = useAllowedCategoryTags();

  const {
    markets,
    isLoading,
    isFetching,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMarkets(statusFilter, debouncedSearch, null, tagSlug);

  // Tab-transition skeleton (Bug 1): TanStack Query keeps cached data per
  // (tagSlug) — switching back to a previously-loaded tag is instant, so
  // `isLoading` stays false and the skeleton never shows. Force a brief
  // loader on every tab change so Trending and other tabs feel consistent.
  // Cleared when isFetching settles or after TAB_TRANSITION_MS as a safety net.
  const TAB_TRANSITION_MS = 280;
  const [isTabTransitioning, setIsTabTransitioning] = useState(false);
  const tabKey = `${tagSlug ?? 'all'}|${myBetsOnly ? 'mb' : ''}|${savedOnly ? 'sv' : ''}`;
  const [lastTabKey, setLastTabKey] = useState(tabKey);
  // Adjust state during render when the tab changes (React's recommended
  // pattern over a setState-in-effect): flips the skeleton on immediately.
  if (lastTabKey !== tabKey) {
    setLastTabKey(tabKey);
    setIsTabTransitioning(true);
  }
  // Clear the flag after a max window once a transition starts...
  useEffect(() => {
    if (!isTabTransitioning) return;
    const id = window.setTimeout(() => setIsTabTransitioning(false), TAB_TRANSITION_MS);
    return () => window.clearTimeout(id);
  }, [isTabTransitioning]);
  // ...or immediately as soon as the underlying query reports it's no longer
  // fetching — so when data arrives faster than the timeout, we don't keep an
  // empty skeleton on screen.
  useEffect(() => {
    if (!isFetching && isTabTransitioning) {
      const id = window.setTimeout(() => setIsTabTransitioning(false), 80);
      return () => window.clearTimeout(id);
    }
  }, [isFetching, isTabTransitioning]);

  const { data: balance } = useUserBalance();
  const { data: bets } = useMyBets();

  // My Bets must match the In-Play drawer (which lists `status='open'` bets) —
  // settled (won/lost/cancelled) bets disappear from My Bets the moment they
  // are settled. The user gets the result via toast (useBetResultNotifications)
  // and balance is returned by settle_market RPC. Settlement history lives on
  // the dedicated /my-bets page, not in this feed tab.
  const openBets = (bets ?? []).filter((b) => b.status === 'open');
  const myBetMarketIds = Array.from(new Set(openBets.map((b) => b.market_id)));
  // Don't apply the status filter to My Bets — an open bet whose market has
  // since closed/resolved (transient pre-settle window) still locks stake in
  // In-Play, so it must remain visible. Status pills still scope the main feed
  // and Saved.
  const {
    data: myBetsMarkets,
    isLoading: isLoadingMyBets,
    isError: isErrorMyBets,
    error: errorMyBets,
  } = useMarketsByIds(myBetMarketIds, 'all', myBetsOnly);
  const savedMarketIds = Array.from(favoriteSet);
  const savedEventIds = Array.from(favoriteEventSet);
  // Fetched regardless of `savedOnly` so the Saved button badge can always
  // advertise the count of cards that would appear on the Saved tab — not
  // only when the tab is active.
  const {
    data: savedStandaloneMarkets,
    isLoading: isLoadingSavedMarkets,
    isError: isErrorSavedMarkets,
    error: errorSavedMarkets,
  } = useMarketsByIds(savedMarketIds, statusFilter, true);
  const {
    data: savedEventMarkets,
    isLoading: isLoadingSavedEvents,
    isError: isErrorSavedEvents,
    error: errorSavedEvents,
  } = useEventsByIds(savedEventIds, statusFilter, true);
  // Saved view dedupe (Bug 4):
  //   Drop any standalone-favourited market whose parent event is ALSO
  //   event-favourited — otherwise the same market surfaces twice (as a
  //   standalone card AND inside the event card preview), and toggling the
  //   bookmark on the duplicated market doesn't appear to remove it because
  //   the parent-event row keeps the market visible until the event itself
  //   is unsaved.
  const savedStandaloneFiltered = (savedStandaloneMarkets ?? []).filter(
    (m) => !m.event_id || !favoriteEventSet.has(m.event_id)
  );
  const savedMarkets = [...(savedEventMarkets ?? []), ...savedStandaloneFiltered];
  const isLoadingSaved = isLoadingSavedMarkets || isLoadingSavedEvents;
  const isErrorSaved = isErrorSavedMarkets || isErrorSavedEvents;
  const errorSaved = errorSavedMarkets ?? errorSavedEvents;
  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleLoadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  useIntersectionObserver(sentinelRef, handleLoadMore, !!hasNextPage && !isFetchingNextPage);

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

  const hasBets = myBetMarketIds.length > 0;

  // Saved-only toggle (moved here from the removed BalanceWidget). Saved is
  // mutually exclusive with my-bets and the tag filter, so turning it on clears
  // both; turning it off returns to the default Popular (`trending`) tag so the
  // feed isn't left empty.
  const handleSavedToggle = () => {
    setSavedOnly((current) => {
      const next = !current;
      if (next) {
        setMyBetsOnly(false);
        setTagSlug(null);
      } else {
        setTagSlug('trending');
      }
      return next;
    });
  };

  // Lookups operate on open bets only — settled bets must not surface in the
  // feed UI (badges, "your stake" lines). They live in the My Bets history page.
  const userBetForMarket = (marketId: string) => openBets.find((b) => b.market_id === marketId);
  const betCountForMarket = (marketId: string) =>
    openBets.filter((b) => b.market_id === marketId).length;

  const sourceMarkets = savedOnly ? savedMarkets : myBetsOnly ? (myBetsMarkets ?? []) : markets;

  // Mirror UI's effectiveStatus rule (see MarketCard/EventCard): a record counts
  // as "open" only if its own status is open, its close_at is in the future, and —
  // for markets attached to an event — the parent event is also effectively open.
  // Skip the rule for My Bets — an open bet whose parent event has since closed
  // still belongs in the user's list (Bug 3).
  const visibleMarkets =
    statusFilter === 'open' && !myBetsOnly
      ? sourceMarkets.filter((m) => isMarketEffectivelyOpen(m, m.event))
      : sourceMarkets;

  const feedItems = groupMarketsByEvent(visibleMarkets);

  // Pull total markets count per event (incl. closed/resolved) so EventCard
  // can avoid collapsing into the single Yes/No visual when only one market
  // is currently open but the event was originally multi-choice. Reuses the
  // same RPC + cache as EventBookmarkButton (`['event-market-counts', ...]`).
  // Recomputed each render; React Compiler memoizes it, and useEventMarketCounts
  // keys on the array by value (TanStack Query hashes the key) so identity churn
  // does not cause extra refetches.
  const eventIdsInFeed = feedItems.flatMap((item) =>
    item.type === 'event' ? [item.event.id] : []
  );
  const { data: eventMarketCounts } = useEventMarketCounts(eventIdsInFeed);

  // Grouped saved cards count for the Saved button badge — applies the same
  // open-event visibility rule as the main feed so the number matches what
  // the user will actually see after clicking Saved.
  const savedVisibleMarkets =
    statusFilter === 'open'
      ? savedMarkets.filter((m) => isMarketEffectivelyOpen(m, m.event))
      : savedMarkets;
  const savedFeedCount = groupMarketsByEvent(savedVisibleMarkets).length;

  const feedIsLoading =
    isTabTransitioning || (savedOnly ? isLoadingSaved : myBetsOnly ? isLoadingMyBets : isLoading);
  const feedIsError = savedOnly ? isErrorSaved : myBetsOnly ? isErrorMyBets : isError;
  const feedError = savedOnly ? errorSaved : myBetsOnly ? errorMyBets : error;

  return (
    <div>
      {/* Header — the World Cup tab gets the animated flag-wheel hero in place
          of the plain page title; every other tab keeps the simple heading. */}
      {tagSlug === 'world-cup' ? (
        <WorldCupHero />
      ) : (
        <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('markets.title')}
        </h1>
      )}

      {/* Category bar — Polymarket-style sub-bar directly under the top nav:
          scrollable category chips (incl. Saved + My bets) on the start side,
          search on the end side. */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          {/* Tag filter — curated popular categories from Polymarket.
              My-bets, Saved and tag selection are mutually exclusive: turning
              one on clears the others so the feed has a single intent. */}
          <div className="min-w-0 flex-1">
            <TagFilter
              value={tagSlug}
              onChange={(next) => {
                setTagSlug(next);
                if (myBetsOnly) setMyBetsOnly(false);
                if (savedOnly) setSavedOnly(false);
              }}
              tags={allowedTags}
              showMyBets={hasBets}
              myBetsActive={myBetsOnly}
              savedActive={savedOnly}
              onSavedToggle={handleSavedToggle}
              savedCount={savedFeedCount}
              onMyBetsToggle={() => {
                setMyBetsOnly((v) => {
                  const nextValue = !v;
                  if (nextValue) {
                    setTagSlug(null);
                    setSavedOnly(false);
                  }
                  return nextValue;
                });
              }}
            />
          </div>

          {/* Search — pinned to the end of the bar. */}
          {!myBetsOnly && (
            <div className="relative flex shrink-0 items-center">
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
                className="w-40 rounded-full border py-1 text-sm outline-none sm:w-52"
                style={{
                  backgroundColor: 'var(--color-bg-elevated)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                  paddingInlineStart: '2rem',
                  paddingInlineEnd: '0.75rem',
                }}
              />
            </div>
          )}
        </div>

        {/* Status pills — only relevant when browsing "All categories" with no
            category / Saved / My bets intent. Hidden otherwise (Polymarket UX). */}
        {tagSlug === null && !savedOnly && !myBetsOnly && (
          <div className="mt-3">
            <StatusFilter value={statusFilter} onChange={setStatusFilter} />
          </div>
        )}
      </div>

      {/* Loading state — initial load */}
      {feedIsLoading && <CardGridSkeleton count={8} />}

      {/* Error state */}
      {feedIsError && (
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>
          {t('common.error')}: {feedError?.message}
        </p>
      )}

      {/* Empty state — no markets at all */}
      {!feedIsLoading && !feedIsError && feedItems.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {savedOnly
            ? t('markets.noSaved')
            : myBetsOnly
              ? hasBets
                ? t('markets.noMyBetsForStatus')
                : t('markets.noMyBets')
              : debouncedSearch
                ? t('markets.noResults')
                : t('markets.noMarkets')}
        </p>
      )}

      {/* Feed grid: events grouped + standalone markets */}
      {!feedIsLoading && !feedIsError && feedItems.length > 0 && (
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
                  // In "my bets" mode only the user's wagered markets are passed;
                  // force multi-row so a truly multi-market event doesn't collapse
                  // into the single-market visual just because siblings were filtered out.
                  forceMultiRow={myBetsOnly}
                  totalMarketsCount={eventMarketCounts?.[item.event.id]}
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

      {/* Infinite scroll sentinel — disabled in fixed-result-set views (my-bets, saved). */}
      {!myBetsOnly && !savedOnly && <div ref={sentinelRef} className="h-4" />}

      {/* Loading next page */}
      {!myBetsOnly && !savedOnly && isFetchingNextPage && (
        <div className="mt-4 flex justify-center">
          <Spinner size="sm" />
        </div>
      )}

      {/* All pages loaded */}
      {!myBetsOnly && !savedOnly && !hasNextPage && markets.length > 0 && !isLoading && (
        <p className="mt-4 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('markets.allLoaded')}
        </p>
      )}

      {/* BetSlip side panel. Keyed on market+outcome so picking a different
          outcome while the panel is open remounts it with fresh state (the
          page stays interactive — no backdrop). */}
      {selectedBet && (
        <BetSlip
          key={`${selectedBet.market.id}:${selectedBet.outcome.id}`}
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
