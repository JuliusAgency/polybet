import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import './SidePanel.css';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  closeDisabled?: boolean;
  /**
   * Render in-flow as a sticky column instead of a fixed floating overlay.
   * The parent must place the panel inside a width-constrained column; the
   * panel then sticks below the header as the page scrolls (Polymarket-style).
   */
  docked?: boolean;
  /** Hide the close (×) button — used when the panel is a permanent column. */
  showClose?: boolean;
  children: ReactNode;
}

// Downward drag (px) past which releasing the mobile bottom-sheet grab handle
// dismisses the panel. Below it, the sheet springs back to the open position.
const SHEET_DISMISS_THRESHOLD_PX = 110;

/**
 * Right-docked panel (Polymarket-style trade panel). On desktop it renders NO
 * backdrop: the page underneath stays visible and fully interactive, so the user
 * can scroll the feed or click another outcome while the panel is open.
 *
 * On mobile (≤767px, non-docked) it becomes a bottom sheet WITH a dimming scrim
 * so it reads as a layer above the site, and its grab handle is a real
 * swipe-to-dismiss control. Geometry / responsive breakpoint live in
 * SidePanel.css.
 *
 * In `docked` mode the panel is in normal flow (`position: sticky`) so it lives
 * inside a layout column rather than floating over the page.
 */
export const SidePanel = ({
  isOpen,
  onClose,
  title,
  closeDisabled = false,
  docked = false,
  showClose = true,
  children,
}: SidePanelProps) => {
  const titleId = useId();

  // Mobile bottom-sheet swipe-to-dismiss. The grab handle is the drag target;
  // the scrollable content below it stays independently scrollable. The visual
  // offset drives a re-render; per-gesture move/up listeners are bound on
  // `window` (not the grab handle) so the gesture keeps tracking even once the
  // finger/pointer leaves the thin handle — the reliable pattern across touch,
  // mouse, and headless drivers. The handle is display:none on
  // desktop/tablet/docked (see SidePanel.css), so a drag never starts there.
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // Detaches the active gesture's window listeners; also run on unmount so a
  // drag interrupted by an external close can never leak listeners.
  const detachDrag = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeDisabled) return;
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeDisabled, isOpen, onClose]);

  useEffect(() => () => detachDrag.current?.(), []);

  if (!isOpen) return null;

  const handleGrabberPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (closeDisabled) return;
    const startY = e.clientY;
    setIsDragging(true);

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientY - startY;
      // Follow the finger 1:1 downward; resist upward pulls (rubber-band) so the
      // sheet can't be dragged above its resting position.
      setDragOffset(delta > 0 ? delta : delta * 0.2);
    };
    const onEnd = (ev: PointerEvent) => {
      detachDrag.current?.();
      setIsDragging(false);
      const delta = ev.clientY - startY;
      if (!closeDisabled && delta > SHEET_DISMISS_THRESHOLD_PX) {
        onClose();
      } else {
        // Snap back to the open position (the transition below animates it).
        setDragOffset(0);
      }
    };

    detachDrag.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      detachDrag.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  // Scrim opacity tracks the drag so the page "reappears" as the sheet is pulled
  // down. The backdrop is display:none outside the mobile bottom sheet (CSS), so
  // this is inert on desktop/tablet/docked.
  const backdropOpacity = dragOffset > 0 ? Math.max(0, 1 - dragOffset / 320) : 1;

  return (
    <>
      {/* Mobile bottom-sheet scrim — only rendered when NOT docked, and only
          visible at the bottom-sheet breakpoint (CSS). Sits below the panel and
          above the bottom tab bar so the sheet reads as a layer above the site. */}
      {!docked && (
        <div
          aria-hidden
          className="side-panel-backdrop"
          style={{ zIndex: 'var(--z-modal-backdrop)', opacity: backdropOpacity }}
          onClick={() => {
            if (!closeDisabled) onClose();
          }}
        />
      )}

      <div
        role="dialog"
        // Not modal: the rest of the page remains interactive behind the panel.
        aria-modal="false"
        aria-labelledby={title ? titleId : undefined}
        className={`side-panel flex flex-col overflow-hidden${docked ? ' side-panel--docked' : ''}`}
        style={{
          backgroundColor: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          zIndex: 'var(--z-modal)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          // Drag offset is only ever non-zero on the mobile bottom sheet; on
          // desktop/docked no drag starts (the handle is hidden), so no transform
          // is applied and the containing block / sticky behaviour is unchanged.
          ...(dragOffset !== 0 && { transform: `translateY(${dragOffset}px)` }),
          transition: isDragging ? 'none' : 'transform var(--duration-base) var(--ease-out-expo)',
        }}
      >
        {/* Mobile bottom-sheet grab handle — drag down to dismiss. CSS hides it
            on the desktop floating card and the docked column, so the pointer
            handlers below never fire outside the bottom sheet. */}
        <div aria-hidden className="side-panel__grabber" onPointerDown={handleGrabberPointerDown}>
          <span />
        </div>

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
            {showClose && (
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
            )}
          </div>
        )}

        {!title && showClose && (
          <div className="side-panel__close-row flex justify-end px-5 pt-4">
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

        <div className="w-full min-w-0 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </>
  );
};
