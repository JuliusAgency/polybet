import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMarkets,
  useAllowedCategoryTags,
  useCategorySubtags,
  subtagsForCategory,
  useMarketsByIds,
  useEventsByIds,
  groupMarketsByEvent,
} from '@/features/bet';
import { useFavoriteMarkets, useFavoriteEvents } from '@/features/favorites';
import type { Market } from '@/entities/market';
import type { MarketStatusFilter } from '@/entities/market';
import { isMarketEffectivelyOpen, CLOSING_TODAY_TAG_SLUG } from '@/entities/market';
import { WORLD_CUP_TAG_SLUG } from '@/shared/config/worldCup';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { useIntersectionObserver } from '@/shared/hooks/useIntersectionObserver';
import { dedupeSavedMarkets, marketMatchesSearch } from '@/shared/utils';
import { MarketCard } from '@/widgets/MarketCard';
import { EventCard } from '@/widgets/EventCard';
import { StatusFilter } from '@/widgets/StatusFilter';
import { TagFilter } from '@/widgets/MarketTagFilter';
import { SubTagFilter } from '@/widgets/MarketSubTagFilter';
import { CollapsibleSearch } from '@/widgets/MarketSearchBox';
import { FeedSearchTools } from '@/widgets/FeedSearchTools';
import { CardGridSkeleton } from '@/shared/ui/CardGridSkeleton';
import { Spinner } from '@/shared/ui/Spinner';

export interface ReadOnlyMarketsFeedProps {
  /**
   * Resolves an event id to its role-scoped detail URL. Injected by the parent
   * page so this widget does not import the app-layer route map (FSD). The
   * detail route must be role-scoped (never the user `/events/:id`, which the
   * RoleGuard would bounce away for admins/managers).
   */
  eventHref: (eventId: string) => string;
  /**
   * Optional archive handler. When omitted the cards render with no archive
   * action — e.g. managers, who cannot archive markets. When provided (admin),
   * the card shows an archive button for resolved markets.
   */
  onArchive?: (market: Market) => void;
  /** Id of the market whose archive request is currently in flight, if any. */
  archivingMarketId?: string | null;
}

/**
 * Read-only markets feed shared by the super-admin and manager Markets pages.
 * Same Polymarket-style feed as the user feed (category bar, sub-tags, saved
 * view, status filter, infinite scroll) but with non-bettable cards and no
 * "My bets" toggle. The only role differences — the detail route and whether
 * archiving is allowed — are injected by the parent page.
 */
export function ReadOnlyMarketsFeed({
  eventHref,
  onArchive,
  archivingMarketId,
}: ReadOnlyMarketsFeedProps) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<MarketStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tagSlug, setTagSlug] = useState<string | null>(null);
  // Secondary tag within the active category (Polymarket related-tags bar).
  // null = no sub-filter ("All"). Cleared whenever the top category changes.
  const [subTagSlug, setSubTagSlug] = useState<string | null>(null);
  // Saved-only view (bookmarked markets/events) and the status-filter bar
  // visibility — both mirror the user feed's header tools.
  const [savedOnly, setSavedOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: allowedTags = [] } = useAllowedCategoryTags();
  const { data: subtagsMap = {} } = useCategorySubtags();
  // Sub-tags for the active category — hidden for the virtual "Closing today"
  // and "World Cup" categories (no related-tags set), mirroring the user feed.
  const showSubTags = tagSlug !== WORLD_CUP_TAG_SLUG && tagSlug !== CLOSING_TODAY_TAG_SLUG;
  const activeSubtags = showSubTags ? subtagsForCategory(subtagsMap, tagSlug) : [];

  const { markets, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMarkets(statusFilter, debouncedSearch, null, tagSlug, subTagSlug);

  // Saved view — bookmarked markets + events, fetched by id and deduped the same
  // way as the user feed. Fetched only while the Saved tab is active.
  const { favoriteSet } = useFavoriteMarkets();
  const { favoriteEventSet } = useFavoriteEvents();
  const savedMarketIds = Array.from(favoriteSet);
  const savedEventIds = Array.from(favoriteEventSet);
  const {
    data: savedStandaloneMarkets,
    isLoading: isLoadingSavedMarkets,
    isError: isErrorSavedMarkets,
    error: errorSavedMarkets,
  } = useMarketsByIds(savedMarketIds, statusFilter, savedOnly);
  const {
    data: savedEventMarkets,
    isLoading: isLoadingSavedEvents,
    isError: isErrorSavedEvents,
    error: errorSavedEvents,
  } = useEventsByIds(savedEventIds, statusFilter, savedOnly);
  const savedMarkets = dedupeSavedMarkets(
    savedEventMarkets ?? [],
    savedStandaloneMarkets ?? [],
    favoriteEventSet
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const handleLoadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  // Only the main (server-paginated) feed has more pages; the Saved view is
  // fetched in full by id, so its infinite-scroll sentinel stays disabled.
  useIntersectionObserver(
    sentinelRef,
    handleLoadMore,
    !savedOnly && !!hasNextPage && !isFetchingNextPage
  );

  // Saved is mutually exclusive with the tag filter: turning it on clears the
  // category + sub-tag and shows everything saved (status filter then refines);
  // turning it off returns to the full feed.
  const handleSavedToggle = () => {
    setSavedOnly((current) => {
      const next = !current;
      setTagSlug(null);
      setSubTagSlug(null);
      setStatusFilter('all');
      return next;
    });
  };

  // Feed source: Saved markets when the Saved tab is active, otherwise the main
  // feed. The Saved set is fetched by id (no server search), so apply the search
  // term client-side there; the main feed is already filtered on the server.
  const sourceMarkets = savedOnly ? savedMarkets : markets;
  const searchedMarkets =
    savedOnly && debouncedSearch.trim()
      ? sourceMarkets.filter((m) => marketMatchesSearch(m, debouncedSearch))
      : sourceMarkets;
  const visibleMarkets =
    statusFilter === 'open'
      ? searchedMarkets.filter((m) => isMarketEffectivelyOpen(m, m.event))
      : searchedMarkets;
  const feedItems = groupMarketsByEvent(visibleMarkets);

  const feedIsLoading = savedOnly ? isLoadingSavedMarkets || isLoadingSavedEvents : isLoading;
  const feedIsError = savedOnly ? isErrorSavedMarkets || isErrorSavedEvents : isError;
  const feedError = savedOnly ? (errorSavedMarkets ?? errorSavedEvents) : error;

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {/* Category bar — Polymarket-style scrollable category chips, identical to
        the user feed. */}
      <div className="mb-4">
        <TagFilter
          value={tagSlug}
          onChange={(next) => {
            setTagSlug(next);
            // Switching the top category drops any active sub-tag and leaves the
            // Saved view (a category pick is a fresh feed intent).
            setSubTagSlug(null);
            if (savedOnly) setSavedOnly(false);
          }}
          tags={allowedTags}
          suppressActiveChip={savedOnly}
        />
      </div>

      {/* Header — page title on the start side; the Saved + Filters toggles and
        the collapsible search at the end. As a flex row with justify-between they
        auto-swap sides in RTL. */}
      <div className="mb-6 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('markets.allTitle')}
        </h1>
        <div className="flex shrink-0 items-center gap-1">
          {/* No My bets toggle — admins/managers don't place bets. */}
          <FeedSearchTools
            showMyBets={false}
            myBetsActive={false}
            onMyBetsToggle={() => {}}
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
        Rendered only when the active category has sub-tags and not in Saved. */}
      {!savedOnly && activeSubtags.length > 0 && (
        <div className="mb-6 -mt-3">
          <SubTagFilter subtags={activeSubtags} value={subTagSlug} onChange={setSubTagSlug} />
        </div>
      )}

      {/* Status pills — hidden until the Filters (sliders) toggle is pressed,
        mirroring the user feed. */}
      {filtersOpen && (
        <div className="mb-6">
          <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        </div>
      )}

      {feedIsLoading && <CardGridSkeleton count={8} />}

      {feedIsError && (
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>
          {t('common.error')}: {feedError?.message}
        </p>
      )}

      {!feedIsLoading && !feedIsError && feedItems.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {debouncedSearch ? t('markets.noResults') : t('markets.noMarkets')}
        </p>
      )}

      {!feedIsLoading && !feedIsError && feedItems.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {feedItems.map((item) => {
            const card =
              item.type === 'event' ? (
                <EventCard
                  event={item.event}
                  markets={item.markets}
                  mode="readonly"
                  outcomeAppearance="inactive"
                  detailHref={eventHref(item.event.id)}
                />
              ) : (
                <MarketCard
                  market={item.market}
                  mode="readonly"
                  outcomeAppearance="inactive"
                  detailHref={item.market.event_id ? eventHref(item.market.event_id) : undefined}
                  onArchive={onArchive}
                  isArchiving={archivingMarketId === item.market.id}
                />
              );
            return (
              <div
                key={item.key}
                style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 260px' }}
              >
                {card}
              </div>
            );
          })}
        </div>
      )}

      <div ref={sentinelRef} className="h-4" />

      {!savedOnly && isFetchingNextPage && (
        <div className="mt-4 flex justify-center">
          <Spinner size="sm" />
        </div>
      )}

      {!savedOnly && !hasNextPage && markets.length > 0 && !isLoading && (
        <p className="mt-4 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('markets.allLoaded')}
        </p>
      )}
    </div>
  );
}
