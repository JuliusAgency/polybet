import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useFavoriteEvents, useToggleFavoriteEvent } from '@/features/favorites';

interface EventBookmarkButtonProps {
  eventId: string;
  stopPropagation?: boolean;
}

export function EventBookmarkButton({ eventId, stopPropagation = false }: EventBookmarkButtonProps) {
  const { t } = useTranslation();
  const { favoriteEventSet } = useFavoriteEvents();
  const toggle = useToggleFavoriteEvent();

  const isFavorite = favoriteEventSet.has(eventId);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (stopPropagation) {
        e.preventDefault();
        e.stopPropagation();
      }
      toggle.mutate({ eventId, currentlyFavorite: isFavorite });
    },
    [toggle, eventId, isFavorite, stopPropagation]
  );

  const label = isFavorite ? t('markets.unfavorite') : t('markets.favorite');

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={toggle.isPending}
      aria-pressed={isFavorite}
      title={label}
      aria-label={label}
      className="rounded-md p-1 transition-colors hover:opacity-80 disabled:opacity-40"
      style={{
        color: isFavorite ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        transitionDuration: 'var(--duration-fast)',
        transitionTimingFunction: 'var(--ease-out-expo)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        {isFavorite && (
          <path
            d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
            fill="currentColor"
            stroke="none"
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
