import { useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useEventFavoriteState, useToggleFavoriteEvent } from '@/features/favorites';

interface EventBookmarkButtonProps {
  eventId: string;
  stopPropagation?: boolean;
}

export function EventBookmarkButton({
  eventId,
  stopPropagation = false,
}: EventBookmarkButtonProps) {
  const { t } = useTranslation();
  const { state, isEventFavorite } = useEventFavoriteState(eventId);
  const toggle = useToggleFavoriteEvent();
  const clipId = useId();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (stopPropagation) {
        e.preventDefault();
        e.stopPropagation();
      }
      // We only ever toggle the event-level row. The partial visual is
      // driven by per-market favorites and is not directly togglable here —
      // clicking attaches/detaches the event itself.
      toggle.mutate({ eventId, currentlyFavorite: isEventFavorite });
    },
    [toggle, eventId, isEventFavorite, stopPropagation]
  );

  const label =
    state === 'full'
      ? t('markets.unfavorite')
      : state === 'partial'
        ? t('markets.partialFavorite')
        : t('markets.favorite');

  const isFilled = state === 'full';
  const isPartial = state === 'partial';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={toggle.isPending}
      aria-pressed={isFilled}
      title={label}
      aria-label={label}
      className="rounded-md p-1 transition-colors hover:opacity-80 disabled:opacity-40"
      style={{
        color: isFilled || isPartial ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        transitionDuration: 'var(--duration-fast)',
        transitionTimingFunction: 'var(--ease-out-expo)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        {isPartial && (
          <defs>
            <clipPath id={clipId}>
              {/* Clip to the bottom half of the icon so only the lower
                  portion gets filled, producing the half-saved indicator. */}
              <rect x="0" y="12" width="24" height="12" />
            </clipPath>
          </defs>
        )}
        {isFilled && (
          <path
            d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
            fill="currentColor"
            stroke="none"
          />
        )}
        {isPartial && (
          <path
            d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
            fill="currentColor"
            stroke="none"
            clipPath={`url(#${clipId})`}
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
