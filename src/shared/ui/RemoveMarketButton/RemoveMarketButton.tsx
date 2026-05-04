import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggleFavoriteMarket } from '@/features/favorites';

interface RemoveMarketButtonProps {
  marketId: string;
}

export function RemoveMarketButton({ marketId }: RemoveMarketButtonProps) {
  const { t } = useTranslation();
  const toggle = useToggleFavoriteMarket();
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      toggle.mutate({ marketId, currentlyFavorite: true });
    },
    [toggle, marketId]
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={toggle.isPending}
      aria-label={t('markets.unfavorite')}
      title={t('markets.unfavorite')}
      className="rounded-md p-1 transition-colors disabled:opacity-40"
      style={{
        color: isHovered ? 'var(--color-error)' : 'var(--color-text-secondary)',
        transitionDuration: 'var(--duration-fast)',
        transitionTimingFunction: 'var(--ease-out-expo)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
