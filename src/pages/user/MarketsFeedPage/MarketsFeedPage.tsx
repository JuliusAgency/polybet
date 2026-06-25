import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ROUTES, buildPath } from '@/app/router/routes';
import {
  useMarkets,
  useMarketsByIds,
  useEventsByIds,
  useUserBalance,
  useMyBets,
  useAllowedCategoryTags,
  useCategorySubtags,
  subtagsForCategory,
  useEventMarketCounts,
  useWorldCupGames,
  useWorldCupProps,
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
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { BetSlip, BETSLIP_DOCK_QUERY } from '@/widgets/BetSlip';
import { StatusFilter } from '@/widgets/StatusFilter';
import { WorldCupHero } from '@/widgets/WorldCupHero';
import { GamesList } from '@/widgets/GamesList';
import { WorldCupMap } from '@/widgets/WorldCupMap';
import { TagFilter } from '@/widgets/MarketTagFilter';
import { SubTagFilter } from '@/widgets/MarketSubTagFilter';
import { CollapsibleSearch } from '@/widgets/MarketSearchBox';
import { WORLD_CUP_TAG_SLUG } from '@/shared/config/worldCup';
import { CLOSING_TODAY_TAG_SLUG } from '@/entities/market';
import { FeedSearchTools } from '@/widgets/FeedSearchTools';
import { dedupeSavedMarkets, marketMatchesSearch } from '@/shared/utils';
import { WorldCupSubTabs, type WorldCupTab } from './components/WorldCupSubTabs';
import { FeedGrid } from './components/FeedGrid';
import { useFeedTabTransition } from './useFeedTabTransition';

const buildEventHref = (id: string) => buildPath(ROUTES.USER.EVENT_DETAIL, { id });

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
  // Secondary tag within the active category (Polymarket related-tags bar).
  // null = no sub-filter ("All"). Cleared whenever the top category changes.
  const [subTagSlug, setSubTagSlug] = useState<string | null>(null);
  const [myBetsOnly, setMyBetsOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  // Status-filter bar (Open / Closed / Archived …), toggled by the Filter
  // (sliders) button in the header. Hidden by default, Polymarket-style.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // World Cup tab sub-navigation. Games is the default landing sub-tab; Props
  // holds the actual market feed, Games/Map are placeholders for now.
  const [worldCupTab, setWorldCupTab] = useState<WorldCupTab>('games');
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: allowedTags = [] } = useAllowedCategoryTags();
  const { data: subtagsMap = {} } = useCategorySubtags();
  // Sub-tags for the active category (Trending/All use the aggregated set).
  // Hidden on World Cup (own sub-tabs), Closing today (virtual), and the
  // personal Saved / My bets views (no category context).
  const showSubTags =
    tagSlug !== WORLD_CUP_TAG_SLUG &&
    tagSlug !== CLOSING_TODAY_TAG_SLUG &&
    !savedOnly &&
    !myBetsOnly;
  const activeSubtags = showSubTags ? subtagsForCategory(subtagsMap, tagSlug) : [];

  const {
    markets,
    isLoading,
    isFetching,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMarkets(statusFilter, debouncedSearch, null, tagSlug, subTagSlug);

  // World Cup Games sub-tab: match cards (France vs. Senegal) with their
  // moneyline markets. Only fetched while the Games sub-tab is active.
  const worldCupGamesEnabled = tagSlug === WORLD_CUP_TAG_SLUG && worldCupTab === 'games';
  const {
    data: worldCupGames = [],
    isLoading: isLoadingGames,
    isError: isErrorGames,
  } = useWorldCupGames(worldCupGamesEnabled);

  // World Cup Props sub-tab: every world-cup-tagged open event (tournament props
  // AND individual matches) rendered one card per event, ordered by event volume.
  // Paginated BY EVENT so a single mega-event ("World Cup Winner" has ~48 open
  // markets) can't swamp the volume-sorted generic feed and collapse the tab to
  // 2 cards. Only fetched while the Props sub-tab is active.
  const worldCupPropsEnabled = tagSlug === WORLD_CUP_TAG_SLUG && worldCupTab === 'props';
  const {
    markets: worldCupPropsMarkets,
    isLoading: isLoadingProps,
    isFetching: isFetchingProps,
    isError: isErrorProps,
    error: errorProps,
    fetchNextPage: fetchNextPropsPage,
    hasNextPage: hasNextPropsPage,
    isFetchingNextPage: isFetchingNextPropsPage,
  } = useWorldCupProps(worldCupPropsEnabled, statusFilter);

  // The Props sub-tab drives its feed + infinite scroll from the dedicated
  // event-paginated hook; every other view uses the generic markets feed. These
  // "active" handles route the shared paging/transition logic to whichever
  // source is on screen.
  const activeFetchNextPage = worldCupPropsEnabled ? fetchNextPropsPage : fetchNextPage;
  const activeHasNextPage = worldCupPropsEnabled ? hasNextPropsPage : hasNextPage;
  const activeIsFetchingNextPage = worldCupPropsEnabled
    ? isFetchingNextPropsPage
    : isFetchingNextPage;
  const activeIsFetching = worldCupPropsEnabled ? isFetchingProps : isFetching;

  // Tab-transition skeleton (Bug 1): TanStack Query keeps cached data per tab,
  // so switching back to a previously-loaded tag is instant — `isLoading` stays
  // false and the skeleton never shows. useFeedTabTransition forces a brief
  // loader on every tab change (cleared when the query settles or after a max
  // window). See the hook for the single-effect rationale.
  const tabKey = `${tagSlug ?? 'all'}|${subTagSlug ?? ''}|${myBetsOnly ? 'mb' : ''}|${savedOnly ? 'sv' : ''}`;
  const isTabTransitioning = useFeedTabTransition(tabKey, activeIsFetching);

  const { data: balance } = useUserBalance();
  const { data: bets } = useMyBets();

  // My Bets must match the In-Play drawer (which lists `status='open'` bets) —
  // settled (won/lost/cancelled) bets disappear from My Bets the moment they
  // are settled. The user gets the result via toast (useBetResultNotifications)
  // and balance is returned by settle_market RPC. Settlement history lives on
  // the dedicated /my-bets page, not in this feed tab.
  const openBets = (bets ?? []).filter((b) => b.status === 'open');
  const myBetMarketIds = Array.from(new Set(openBets.map((b) => b.market_id)));
  // My bets honours the status filter like every other view, but the view
  // *defaults* to 'all' (set on toggle) so an open bet on a since-closed/resolved
  // market — whose stake is still locked in In-Play — stays visible until the
  // user deliberately narrows the filter.
  const {
    data: myBetsMarkets,
    isLoading: isLoadingMyBets,
    isError: isErrorMyBets,
    error: errorMyBets,
  } = useMarketsByIds(myBetMarketIds, statusFilter, myBetsOnly, myBetsOnly);
  const savedMarketIds = Array.from(favoriteSet);
  const savedEventIds = Array.from(favoriteEventSet);
  // Fetched regardless of `savedOnly` so switching to the Saved tab is instant
  // (prefetched). They live-poll prices at the fast cadence only while the tab is
  // actually open (the `savedOnly` arg), so browsing other tabs never polls the
  // saved set in the background.
  const {
    data: savedStandaloneMarkets,
    isLoading: isLoadingSavedMarkets,
    isError: isErrorSavedMarkets,
    error: errorSavedMarkets,
  } = useMarketsByIds(savedMarketIds, statusFilter, true, savedOnly);
  const {
    data: savedEventMarkets,
    isLoading: isLoadingSavedEvents,
    isError: isErrorSavedEvents,
    error: errorSavedEvents,
  } = useEventsByIds(savedEventIds, statusFilter, true, savedOnly);
  // Saved view dedupe (Bug 4) — see dedupeSavedMarkets for the rationale.
  const savedMarkets = dedupeSavedMarkets(
    savedEventMarkets ?? [],
    savedStandaloneMarkets ?? [],
    favoriteEventSet
  );
  const isLoadingSaved = isLoadingSavedMarkets || isLoadingSavedEvents;
  const isErrorSaved = isErrorSavedMarkets || isErrorSavedEvents;
  const errorSaved = errorSavedMarkets ?? errorSavedEvents;
  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);
  // On desktop a selected bet docks into a sticky sidebar column instead of
  // floating over the feed; narrower viewports keep the overlay / bottom-sheet.
  const isDesktop = useMediaQuery(BETSLIP_DOCK_QUERY);
  const dockSlip = isDesktop && !!selectedBet;
  // Bumped after a successful trade so the docked slip remounts with a cleared
  // amount while staying open (it does not auto-close on the docked column).
  const [slipNonce, setSlipNonce] = useState(0);
  // Drop one feed column while the docked slip steals horizontal space so cards
  // don't get squeezed thin.
  const feedGridClass = dockSlip
    ? 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'
    : 'grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleLoadMore = useCallback(() => {
    void activeFetchNextPage();
  }, [activeFetchNextPage]);

  useIntersectionObserver(
    sentinelRef,
    handleLoadMore,
    !!activeHasNextPage && !activeIsFetchingNextPage
  );

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
  const hasSaved = savedMarketIds.length > 0 || savedEventIds.length > 0;

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
        setSubTagSlug(null);
        // Saved is a personal collection — show everything saved by default; the
        // status filter then refines it. Back to the main-feed default on exit.
        setStatusFilter('all');
      } else {
        setTagSlug('trending');
        setStatusFilter('open');
      }
      return next;
    });
  };

  // My bets owns the feed intent too — turning it on clears the tag filter and
  // Saved so the feed shows exactly the user's open-bet markets.
  const handleMyBetsToggle = () => {
    setMyBetsOnly((current) => {
      const next = !current;
      if (next) {
        setTagSlug(null);
        setSubTagSlug(null);
        setSavedOnly(false);
        // Show all of the user's bets by default; the status filter refines it.
        setStatusFilter('all');
      } else {
        setStatusFilter('open');
      }
      return next;
    });
  };

  // Lookups operate on open bets only — settled bets must not surface in the
  // feed UI (badges, "your stake" lines). They live in the My Bets history page.
  const userBetForMarket = (marketId: string) => openBets.find((b) => b.market_id === marketId);
  const betCountForMarket = (marketId: string) =>
    openBets.filter((b) => b.market_id === marketId).length;

  const sourceMarkets = savedOnly
    ? savedMarkets
    : myBetsOnly
      ? (myBetsMarkets ?? [])
      : worldCupPropsEnabled
        ? worldCupPropsMarkets
        : markets;

  // Saved and My bets are fetched by id (no server-side search), so apply the
  // search term client-side for those views — the main feed already filtered on
  // the server, so leave it untouched (its server match may span fields the
  // client predicate doesn't).
  const searchedMarkets =
    (savedOnly || myBetsOnly) && debouncedSearch.trim()
      ? sourceMarkets.filter((m) => marketMatchesSearch(m, debouncedSearch))
      : sourceMarkets;

  // Mirror UI's effectiveStatus rule (see MarketCard/EventCard): a record counts
  // as "open" only if its own status is open, its close_at is in the future, and —
  // for markets attached to an event — the parent event is also effectively open.
  // Applies to every view (incl. My bets) now that the personal views default to
  // 'all' — the open rule only kicks in when the user explicitly picks "Open".
  const visibleMarkets =
    statusFilter === 'open'
      ? searchedMarkets.filter((m) => isMarketEffectivelyOpen(m, m.event))
      : searchedMarkets;

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

  const feedIsLoading =
    isTabTransitioning ||
    (savedOnly
      ? isLoadingSaved
      : myBetsOnly
        ? isLoadingMyBets
        : worldCupPropsEnabled
          ? isLoadingProps
          : isLoading);
  const feedIsError = savedOnly
    ? isErrorSaved
    : myBetsOnly
      ? isErrorMyBets
      : worldCupPropsEnabled
        ? isErrorProps
        : isError;
  const feedError = savedOnly
    ? errorSaved
    : myBetsOnly
      ? errorMyBets
      : worldCupPropsEnabled
        ? errorProps
        : error;

  // World Cup tab: the hero + sub-tabs render below the tag bar, and the market
  // feed is shown only on the Props sub-tab (Games/Map are placeholders).
  const isWorldCup = tagSlug === 'world-cup';
  const showFeed = !isWorldCup || worldCupTab === 'props';

  return (
    <div className={dockSlip ? 'flex gap-6' : undefined}>
      <div className={dockSlip ? 'min-w-0 flex-1' : undefined}>
        {/* Category bar — Polymarket-style sub-bar sitting directly under the top
          nav (above the page title + search row below): scrollable category
          chips. Saved + My bets toggles and search live in the header row below. */}
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
                  // Switching the top category drops any active sub-tag — the
                  // sub-tag set is per-category and would not apply.
                  setSubTagSlug(null);
                  // Leaving a personal view (My bets / Saved) for a category
                  // returns to the main-feed default of 'open'.
                  if (myBetsOnly || savedOnly) setStatusFilter('open');
                  if (myBetsOnly) setMyBetsOnly(false);
                  if (savedOnly) setSavedOnly(false);
                }}
                tags={allowedTags}
                suppressActiveChip={savedOnly || myBetsOnly}
              />
            </div>
          </div>
        </div>

        {/* Header — page title on the start side; the search tools (Saved + My
          bets icon toggles) and the search input sit at the end of the same row.
          On World Cup the title is omitted (the flag-wheel hero below carries its
          own heading); a spacer keeps the group end-aligned. As a flex row with
          justify-between, title and tools auto-swap sides in RTL. */}
        <div className="mb-6 flex items-center justify-between gap-2">
          {!isWorldCup ? (
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {t('markets.allTitle')}
            </h1>
          ) : (
            <span />
          )}

          {/* Saved + My bets icon toggles and a Polymarket-style collapsible
            search — all always visible. The search now filters the My bets and
            Saved views too (client-side), not just the main feed, so it no longer
            hides when either is active. */}
          <div className="flex shrink-0 items-center gap-1">
            <FeedSearchTools
              showMyBets={hasBets}
              myBetsActive={myBetsOnly}
              onMyBetsToggle={handleMyBetsToggle}
              savedActive={savedOnly}
              onSavedToggle={handleSavedToggle}
              filtersActive={filtersOpen}
              onFiltersToggle={() => setFiltersOpen((v) => !v)}
            />
            <CollapsibleSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t('markets.searchFeedPlaceholder')}
            />
          </div>
        </div>

        {/* Sub-tag bar — Polymarket's related-tags carousel under the title.
          Refines the feed within the active category; rendered only when the
          category actually has sub-tags (see showSubTags / activeSubtags). */}
        {activeSubtags.length > 0 && (
          <div className="mb-6 -mt-3">
            <SubTagFilter subtags={activeSubtags} value={subTagSlug} onChange={setSubTagSlug} />
          </div>
        )}

        {/* Filter bar — toggled by the Filter (sliders) button in the header row.
          Holds the market status pills (Open / Closed / Archived …) and sits
          directly under the title + search row, Polymarket-style. On the World
          Cup tab it renders under the Games/Props/Map sub-tabs instead, scoped to
          Props only — see the World Cup section below. */}
        {filtersOpen && !isWorldCup && (
          <div className="mb-6">
            <StatusFilter value={statusFilter} onChange={setStatusFilter} />
          </div>
        )}

        {/* World Cup: the animated hero and its Games/Props/Map sub-tabs render
          below the tag bar. Props shows the market feed; Games/Map are stubs. */}
        {isWorldCup && (
          <div className="mb-4">
            <WorldCupHero />
            <WorldCupSubTabs value={worldCupTab} onChange={setWorldCupTab} />
            {/* Status filter — under the sub-tabs, and only on Props (the sole
              sub-tab with a market feed it can scope). Games/Map have nothing to
              filter, so it stays hidden there. */}
            {filtersOpen && worldCupTab === 'props' && (
              <div className="mt-4">
                <StatusFilter value={statusFilter} onChange={setStatusFilter} />
              </div>
            )}
          </div>
        )}

        {/* World Cup Games sub-tab: match cards grouped by day. */}
        {isWorldCup && worldCupTab === 'games' && (
          <GamesList
            games={worldCupGames}
            isLoading={isLoadingGames}
            isError={isErrorGames}
            onOutcomeClick={handleOutcomeClick}
            selected={
              selectedBet
                ? { marketId: selectedBet.market.id, outcomeId: selectedBet.outcome.id }
                : null
            }
            buildEventHref={buildEventHref}
          />
        )}

        {/* Map sub-tab — interactive dotted globe + ranked country roster wired to
          the "World Cup Winner" event. */}
        {isWorldCup && worldCupTab === 'map' && (
          <div className="mb-4">
            <WorldCupMap buildEventHref={buildEventHref} />
          </div>
        )}

        {/* Market feed — shown on every tab, and on World Cup only under Props. */}
        {showFeed && (
          <>
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
                {debouncedSearch.trim()
                  ? t('markets.noResults')
                  : savedOnly
                    ? hasSaved
                      ? t('markets.noSavedForStatus')
                      : t('markets.noSaved')
                    : myBetsOnly
                      ? hasBets
                        ? t('markets.noMyBetsForStatus')
                        : t('markets.noMyBets')
                      : t('markets.noMarkets')}
              </p>
            )}

            {/* Feed grid: events grouped + standalone markets */}
            {!feedIsLoading && !feedIsError && feedItems.length > 0 && (
              <FeedGrid
                items={feedItems}
                gridClassName={feedGridClass}
                bets={bets ?? []}
                forceMultiRow={myBetsOnly}
                eventMarketCounts={eventMarketCounts}
                onOutcomeClick={handleOutcomeClick}
                getUserBet={userBetForMarket}
                getBetCount={betCountForMarket}
              />
            )}

            {/* Infinite scroll sentinel — disabled in fixed-result-set views (my-bets, saved). */}
            {!myBetsOnly && !savedOnly && <div ref={sentinelRef} className="h-4" />}

            {/* Loading next page */}
            {!myBetsOnly && !savedOnly && activeIsFetchingNextPage && (
              <div className="mt-4 flex justify-center">
                <Spinner size="sm" />
              </div>
            )}

            {/* All pages loaded */}
            {!myBetsOnly &&
              !savedOnly &&
              !activeHasNextPage &&
              sourceMarkets.length > 0 &&
              !feedIsLoading && (
                <p
                  className="mt-4 text-center text-sm"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t('markets.allLoaded')}
                </p>
              )}
          </>
        )}
      </div>

      {/* Desktop: docked sticky trade column beside the feed. Keyed on
          market+outcome so picking a different outcome remounts it fresh. */}
      {dockSlip && (
        <aside className="w-[360px] shrink-0">
          <BetSlip
            key={`${selectedBet.market.id}:${selectedBet.outcome.id}:${slipNonce}`}
            market={selectedBet.market}
            outcome={selectedBet.outcome}
            availableBalance={availableBalance}
            docked
            showClose={false}
            onClose={() => {}}
            onSuccess={() => setSlipNonce((n) => n + 1)}
          />
        </aside>
      )}

      {/* Mobile / non-desktop: floating overlay (no backdrop — page stays
          interactive). */}
      {!isDesktop && selectedBet && (
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
