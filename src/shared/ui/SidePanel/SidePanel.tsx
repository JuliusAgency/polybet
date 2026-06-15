import { useEffect, useId, type ReactNode } from 'react';
import './SidePanel.css';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  closeDisabled?: boolean;
  children: ReactNode;
}

/**
 * Right-docked panel (Polymarket-style trade panel). Unlike Modal, it renders
 * NO backdrop: the page underneath stays visible and fully interactive, so the
 * user can scroll the feed or click another outcome while the panel is open.
 * Geometry / responsive bottom-sheet fallback live in SidePanel.css.
 */
export const SidePanel = ({
  isOpen,
  onClose,
  title,
  closeDisabled = false,
  children,
}: SidePanelProps) => {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeDisabled) return;
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeDisabled, isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      // Not modal: the rest of the page remains interactive behind the panel.
      aria-modal="false"
      aria-labelledby={title ? titleId : undefined}
      className="side-panel flex flex-col overflow-hidden"
      style={{
        backgroundColor: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        zIndex: 'var(--z-modal)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
      }}
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

      <div className="overflow-y-auto px-5 py-4">{children}</div>
    </div>
  );
};
