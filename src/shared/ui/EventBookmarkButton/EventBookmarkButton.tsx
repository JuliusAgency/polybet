import { useId, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useFavoriteMarkets, useToggleFavoriteEvent } from '@/features/favorites';

type BookmarkState = 'none' | 'partial' | 'all';

interface EventBookmarkButtonProps {
  marketIds: string[];
  stopPropagation?: boolean;
  // When provided, used to determine 'partial' state — i.e. saved (= marketIds
  // intersected with favoriteSet) vs total markets of the event. Needed on the
  // Saved page where `marketIds` only contains saved markets, so without it
  // state always evaluates to 'all'.
  totalMarketsCount?: number;
}

export function EventBookmarkButton({
  marketIds,
  stopPropagation = false,
  totalMarketsCount,
}: EventBookmarkButtonProps) {
  const { t } = useTranslation();
  const clipId = useId();
  const { favoriteSet } = useFavoriteMarkets();
  const toggle = useToggleFavoriteEvent();

  const savedCount = marketIds.filter((id) => favoriteSet.has(id)).length;
  const total = totalMarketsCount ?? marketIds.length;
  const state: BookmarkState = savedCount === 0 ? 'none' : savedCount >= total ? 'all' : 'partial';

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (stopPropagation) {
        e.preventDefault();
        e.stopPropagation();
      }
      toggle.mutate({ marketIds, mode: state === 'none' ? 'add' : 'remove' });
    },
    [toggle, marketIds, state, stopPropagation]
  );

  const label = state === 'none' ? t('markets.favorite') : t('markets.unfavorite');

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={toggle.isPending}
      aria-pressed={state !== 'none'}
      title={label}
      aria-label={label}
      className="rounded-md p-1 transition-colors hover:opacity-80 disabled:opacity-40"
      style={{
        color: state !== 'none' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        transitionDuration: 'var(--duration-fast)',
        transitionTimingFunction: 'var(--ease-out-expo)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        {state === 'partial' && (
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width="12" height="24" />
            </clipPath>
          </defs>
        )}
        {state !== 'none' && (
          <path
            d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
            fill="currentColor"
            stroke="none"
            clipPath={state === 'partial' ? `url(#${clipId})` : undefined}
          />
        )}
        <path
          d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
