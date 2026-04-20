import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useFavoriteMarkets, useToggleFavoriteMarket } from '@/features/favorites';

interface BookmarkButtonProps {
  marketId: string;
  /** Stops the click from bubbling into an enclosing <Link>. */
  stopPropagation?: boolean;
}

/**
 * Icon-only toggle that saves / unsaves a market to the user's favorites.
 * Renders a static-looking bookmark silhouette; filled when saved, outlined when not.
 * Style mirrors the refresh/archive footer icons in MarketCard.
 */
export function BookmarkButton({ marketId, stopPropagation = true }: BookmarkButtonProps) {
  const { t } = useTranslation();
  const { favoriteSet } = useFavoriteMarkets();
  const toggle = useToggleFavoriteMarket();

  const isFavorite = favoriteSet.has(marketId);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (stopPropagation) {
        event.preventDefault();
        event.stopPropagation();
      }
      toggle.mutate({ marketId, isFavorite });
    },
    [toggle, marketId, isFavorite, stopPropagation],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={toggle.isPending}
      aria-pressed={isFavorite}
      title={isFavorite ? t('markets.unfavorite') : t('markets.favorite')}
      aria-label={isFavorite ? t('markets.unfavorite') : t('markets.favorite')}
      className="rounded-md p-1 transition-colors hover:opacity-80 disabled:opacity-40"
      style={{
        color: isFavorite ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        transitionDuration: 'var(--duration-fast)',
        transitionTimingFunction: 'var(--ease-out-expo)',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={isFavorite ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
