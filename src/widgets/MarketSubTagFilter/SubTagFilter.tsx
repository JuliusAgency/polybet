import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHorizontalScroll } from '@/shared/hooks/useHorizontalScroll';
import type { CategorySubtag } from '@/features/bet';

interface SubTagFilterProps {
  /** Sub-tags for the active top-level category (already resolved + ordered). */
  subtags: CategorySubtag[];
  /** Selected sub-tag slug, or null for the "All" (no sub-filter) state. */
  value: string | null;
  onChange: (value: string | null) => void;
}

// How far one chevron press scrolls, as a fraction of the visible width — keeps
// a few chips of overlap so the user doesn't lose their place.
const SCROLL_STEP_RATIO = 0.7;
// Tolerance (px) for treating the row as "at the edge" — avoids a chevron that
// flickers on sub-pixel scroll offsets.
const EDGE_EPSILON = 2;

/**
 * Secondary, lighter-weight tag row under the page title — Polymarket's
 * related-tags carousel. Refines the feed within the active category; renders
 * nothing when the category has no sub-tags.
 *
 * Overflow is handled with edge chevron buttons (Polymarket-style) instead of a
 * visible scrollbar: a fading chevron appears on each side only when there is
 * more content that way. Wheel + click-drag still work via useHorizontalScroll.
 */
export function SubTagFilter({ subtags, value, onChange }: SubTagFilterProps) {
  const { t } = useTranslation();
  // useHorizontalScroll owns wheel/drag; we also need the node to measure
  // overflow and drive the chevrons, so compose its callback ref with our own.
  const attachScroll = useHorizontalScroll<HTMLDivElement>();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const setRowRef = useCallback(
    (node: HTMLDivElement | null) => {
      rowRef.current = node;
      attachScroll(node);
    },
    [attachScroll]
  );

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateChevrons = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    // scrollLeft is negative in RTL (modern browsers); abs() gives the distance
    // from the logical start regardless of direction.
    const fromStart = Math.abs(el.scrollLeft);
    const atStart = fromStart <= EDGE_EPSILON;
    const atEnd = fromStart >= maxScroll - EDGE_EPSILON;
    const isRtl = getComputedStyle(el).direction === 'rtl';
    // Chevrons sit at the physical screen edges. In LTR the logical start is on
    // the left; in RTL it is on the right, so the mapping flips.
    setCanScrollLeft(isRtl ? !atEnd : !atStart);
    setCanScrollRight(isRtl ? !atStart : !atEnd);
  }, []);

  // Re-measure when the chip set changes (new category) or the row resizes.
  // Initial measurement comes from ResizeObserver's first callback, so we never
  // call setState directly in the effect body.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const onScroll = () => updateChevrons();
    el.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(() => updateChevrons());
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [updateChevrons, subtags]);

  // Physical scroll: left chevron always reveals content to the screen-left
  // (negative scrollLeft delta) in both LTR and RTL; right chevron the reverse.
  const scrollByDirection = (direction: -1 | 1) => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * SCROLL_STEP_RATIO, behavior: 'smooth' });
  };

  if (subtags.length === 0) return null;

  const renderChip = (slug: string | null, label: string) => {
    const isActive = value === slug;
    return (
      <button
        key={slug ?? '__all__'}
        onClick={() => onChange(slug)}
        aria-pressed={isActive}
        className="shrink-0 px-2.5 py-1 text-sm font-medium transition-colors"
        style={{
          borderRadius: 'var(--radius-sm)',
          backgroundColor: isActive
            ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
            : 'transparent',
          color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="relative">
      {canScrollLeft && (
        <button
          type="button"
          aria-label={t('markets.scrollLeft')}
          onClick={() => scrollByDirection(-1)}
          className="absolute inset-y-0 left-0 z-10 flex items-center pe-8 ps-1"
          style={{ background: 'linear-gradient(to right, var(--color-bg-base) 60%, transparent)' }}
        >
          <ChevronIcon direction="left" />
        </button>
      )}

      <div
        ref={setRowRef}
        className="flex items-center gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* "All" clears the sub-filter back to the whole category. */}
        {renderChip(null, t('markets.subtagAll'))}
        {subtags.map((subtag) => renderChip(subtag.slug, subtag.label))}
      </div>

      {canScrollRight && (
        <button
          type="button"
          aria-label={t('markets.scrollRight')}
          onClick={() => scrollByDirection(1)}
          className="absolute inset-y-0 right-0 z-10 flex items-center ps-8 pe-1"
          style={{ background: 'linear-gradient(to left, var(--color-bg-base) 60%, transparent)' }}
        >
          <ChevronIcon direction="right" />
        </button>
      )}
    </div>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <span
      className="flex h-6 w-6 items-center justify-center rounded-full"
      style={{
        backgroundColor: 'var(--color-bg-elevated)',
        color: 'var(--color-text-secondary)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {direction === 'left' ? (
          <polyline points="15 18 9 12 15 6" />
        ) : (
          <polyline points="9 18 15 12 9 6" />
        )}
      </svg>
    </span>
  );
}
