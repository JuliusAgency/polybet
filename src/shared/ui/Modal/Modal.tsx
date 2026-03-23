import { useEffect, useId, type ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  closeDisabled?: boolean;
  children: ReactNode;
}

export const Modal = ({ isOpen, onClose, title, closeDisabled = false, children }: ModalProps) => {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeDisabled) {
        return;
      }

      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDisabled, isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 'var(--z-modal-backdrop)',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
      }}
      onClick={() => {
        if (!closeDisabled) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className="w-full max-w-md rounded-xl shadow-lg"
        style={{
          backgroundColor: 'var(--color-bg-elevated)',
          zIndex: 'var(--z-modal)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div
            className="flex items-center justify-between border-b px-5 py-4"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <h2
              id={titleId}
              className="text-base font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              disabled={closeDisabled}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-lg transition-colors"
              style={{
                color: 'var(--color-text-secondary)',
                opacity: closeDisabled ? 0.4 : 1,
                cursor: closeDisabled ? 'not-allowed' : 'pointer',
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}

        {!title && (
          <div className="flex justify-end px-5 pt-4">
            <button
              onClick={onClose}
              disabled={closeDisabled}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-lg transition-colors"
              style={{
                color: 'var(--color-text-secondary)',
                opacity: closeDisabled ? 0.4 : 1,
                cursor: closeDisabled ? 'not-allowed' : 'pointer',
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}

        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
};
