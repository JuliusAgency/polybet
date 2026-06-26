import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PriceHistoryWindow } from '@/shared/types/priceHistory';
import { PriceHistoryWindowToggle } from './PriceHistoryWindowToggle';

interface PriceHistorySectionProps {
  historyWindow: PriceHistoryWindow;
  /** Should set the window AND expand the chart (see usePriceHistoryCollapse). */
  onWindowChange: (value: PriceHistoryWindow) => void;
  /** Whether the chart is shown. From md up this is always true. */
  open: boolean;
  /** Reveal the chart — wired to the collapsed-state placeholder. */
  onExpand: () => void;
  /** Toggle the chart open/closed — wired to the mobile header chevron. */
  onToggle: () => void;
  /** The chart itself (rendered only when `open`). */
  children: ReactNode;
}

/**
 * Card shell + header (title, timeframe chips, mobile collapse chevron) shared by
 * the single-market (SingleMarketView) and multi-market (EventPriceHistoryChart)
 * detail charts. Full-bleed on mobile; framed card from md up.
 *
 * When collapsed (mobile, chart not yet opened) it shows only the timeframe chips
 * plus a tap-to-load placeholder — tapping a chip or the placeholder opens it.
 * Implemented as a WAI-ARIA disclosure: the chevron's aria-controls points at the
 * panel id so AT users can reach the region it reveals.
 */
export const PriceHistorySection = ({
  historyWindow,
  onWindowChange,
  open,
  onExpand,
  onToggle,
  children,
}: PriceHistorySectionProps) => {
  const { t } = useTranslation();
  const panelId = useId();
  const title = t('eventDetail.priceHistory', { defaultValue: 'Price history' });

  return (
    <section
      className="flex flex-col gap-3 md:rounded-[var(--radius-lg)] md:border md:bg-[var(--color-bg-surface)] md:p-4"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {title}
        </h3>
        <div className="flex items-center gap-2">
          <PriceHistoryWindowToggle
            value={historyWindow}
            onChange={onWindowChange}
            ariaLabel={title}
          />
          {/* Mobile-only collapse toggle. The chart is collapsed by default on
              phones so it doesn't dominate the first screen; this and the
              timeframe chips both open it. Hidden from md up (always open). */}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={t('eventDetail.togglePriceHistory', {
              defaultValue: 'Toggle price history chart',
            })}
            className="flex h-6 w-6 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] md:hidden"
            style={{
              color: 'var(--color-text-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{
                transform: open ? 'rotate(180deg)' : 'none',
                transitionProperty: 'transform',
                transitionDuration: 'var(--duration-fast)',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      <div id={panelId}>
        {open ? (
          children
        ) : (
          <button
            type="button"
            onClick={onExpand}
            className="flex w-full items-center justify-center rounded-[var(--radius-md)] py-6 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
            style={{
              color: 'var(--color-text-muted)',
              backgroundColor: 'var(--color-bg-base)',
              border: '1px dashed var(--color-border)',
              cursor: 'pointer',
            }}
          >
            {t('eventDetail.tapToLoadChart', { defaultValue: 'Select a range to view the chart' })}
          </button>
        )}
      </div>
    </section>
  );
};
