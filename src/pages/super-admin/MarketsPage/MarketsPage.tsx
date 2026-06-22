import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMarkets,
  useAllowedCategoryTags,
  useCategorySubtags,
  subtagsForCategory,
  groupMarketsByEvent,
} from '@/features/bet';
import type { Market } from '@/entities/market';
import type { MarketStatusFilter } from '@/entities/market';
import { isMarketEffectivelyOpen, CLOSING_TODAY_TAG_SLUG } from '@/entities/market';
import { WORLD_CUP_TAG_SLUG } from '@/shared/config/worldCup';
import { useArchiveMarket } from '@/features/admin/markets/useArchiveMarket';
import { ROUTES, buildPath } from '@/app/router/routes';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { useIntersectionObserver } from '@/shared/hooks/useIntersectionObserver';
import { MarketCard } from '@/widgets/MarketCard';
import { EventCard } from '@/widgets/EventCard';
import { StatusFilter } from '@/widgets/StatusFilter';
import { TagFilter } from '@/widgets/MarketTagFilter';
import { SubTagFilter } from '@/widgets/MarketSubTagFilter';
import { CollapsibleSearch } from '@/widgets/MarketSearchBox';
import { CardGridSkeleton } from '@/shared/ui/CardGridSkeleton';
import { Spinner } from '@/shared/ui/Spinner';

const MarketsPage = () => {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<MarketStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tagSlug, setTagSlug] = useState<string | null>(null);
  // Secondary tag within the active category (Polymarket related-tags bar).
  // null = no sub-filter ("All"). Cleared whenever the top category changes.
  const [subTagSlug, setSubTagSlug] = useState<string | null>(null);
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: allowedTags = [] } = useAllowedCategoryTags();
  const { data: subtagsMap = {} } = useCategorySubtags();
  // Sub-tags for the active category — hidden for the virtual "Closing today"
  // and "World Cup" categories (no related-tags set), mirroring the user feed.
  const showSubTags = tagSlug !== WORLD_CUP_TAG_SLUG && tagSlug !== CLOSING_TODAY_TAG_SLUG;
  const activeSubtags = showSubTags ? subtagsForCategory(subtagsMap, tagSlug) : [];

  const { markets, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMarkets(statusFilter, debouncedSearch, null, tagSlug, subTagSlug);

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

  // Group same-event markets into a single Event card (mirrors the user feed)
  // so a multi-candidate event renders as ONE card instead of one per outcome.
  const visibleMarkets =
    statusFilter === 'open' ? markets.filter((m) => isMarketEffectivelyOpen(m, m.event)) : markets;
  const feedItems = groupMarketsByEvent(visibleMarkets);

  // Admin Markets is read-only: cards open a role-scoped detail route (never the
  // user `/events/:id`, which the RoleGuard would bounce to the Dashboard) and
  // the outcome pills render as non-bettable.
  const eventHref = (eventId: string) => buildPath(ROUTES.ADMIN.MARKET_DETAIL, { id: eventId });

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {/* Category bar — Polymarket-style scrollable category chips, identical to
        the user feed. */}
      <div className="mb-4">
        <TagFilter
          value={tagSlug}
          onChange={(next) => {
            setTagSlug(next);
            // Switching the top category drops any active sub-tag.
            setSubTagSlug(null);
          }}
          tags={allowedTags}
        />
      </div>

      {/* Header — page title on the start side; the collapsible search at the
        end. As a flex row with justify-between they auto-swap sides in RTL. */}
      <div className="mb-6 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('markets.allTitle')}
        </h1>
        <div className="flex shrink-0 items-center gap-1">
          <CollapsibleSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t('markets.searchPlaceholder')}
          />
        </div>
      </div>

      {/* Sub-tag bar — Polymarket's related-tags carousel under the title.
        Rendered only when the active category actually has sub-tags. */}
      {activeSubtags.length > 0 && (
        <div className="mb-6 -mt-3">
          <SubTagFilter subtags={activeSubtags} value={subTagSlug} onChange={setSubTagSlug} />
        </div>
      )}

      {/* Status pills — Open / Closed / Archived. */}
      <div className="mb-6">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
      </div>

      {isLoading && <CardGridSkeleton count={8} />}

      {isError && (
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>
          {t('common.error')}: {error?.message}
        </p>
      )}

      {!isLoading && !isError && feedItems.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {debouncedSearch ? t('markets.noResults') : t('markets.noMarkets')}
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
                  onArchive={handleArchive}
                  isArchiving={
                    archiveMarket.isPending && archiveMarket.variables?.marketId === item.market.id
                  }
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
