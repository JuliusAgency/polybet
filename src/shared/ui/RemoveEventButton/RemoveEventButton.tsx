import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/shared/ui/Modal';
import { useToggleFavoriteEvent, useFavoriteEvents } from '@/features/favorites';

interface RemoveEventButtonProps {
  eventId: string;
}

export function RemoveEventButton({ eventId }: RemoveEventButtonProps) {
  const { t } = useTranslation();
  const toggle = useToggleFavoriteEvent();
  const { favoriteEventSet } = useFavoriteEvents();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const openConfirm = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsConfirmOpen(true);
  }, []);

  const handleConfirm = useCallback(() => {
    toggle.mutate({ eventId, currentlyFavorite: favoriteEventSet.has(eventId) });
    setIsConfirmOpen(false);
  }, [toggle, eventId, favoriteEventSet]);

  return (
    <>
      <button
        type="button"
        onClick={openConfirm}
        disabled={toggle.isPending}
        aria-label={t('markets.removeEvent')}
        title={t('markets.removeEvent')}
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
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>

      <Modal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title={t('markets.removeEvent')}
      >
        <p className="mb-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('markets.removeEventConfirm', { count: 1 })}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsConfirmOpen(false)}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              transitionDuration: 'var(--duration-fast)',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={toggle.isPending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60"
            style={{
              backgroundColor: 'var(--color-error)',
              transitionDuration: 'var(--duration-fast)',
            }}
          >
            {t('common.remove')}
          </button>
        </div>
      </Modal>
    </>
  );
}
