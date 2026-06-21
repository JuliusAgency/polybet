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

/**
 * Secondary, lighter-weight tag row under the page title — Polymarket's
 * related-tags carousel. Sits below the bordered top category bar (`TagFilter`)
 * and refines the feed within the active category. Renders nothing when the
 * category has no sub-tags.
 *
 * Visually distinct from the top bar: plain text chips (no border), the active
 * one gets a soft accent pill — so the two rows read as a hierarchy, not two
 * competing bars. Reuses `.tag-filter-row` (scrollbar affordance) and
 * `useHorizontalScroll` (wheel + click-drag) from the top bar.
 */
export function SubTagFilter({ subtags, value, onChange }: SubTagFilterProps) {
  const { t } = useTranslation();
  const setRowRef = useHorizontalScroll<HTMLDivElement>();

  if (subtags.length === 0) return null;

  const renderChip = (slug: string | null, label: string) => {
    const isActive = value === slug;
    return (
      <button
        key={slug ?? '__all__'}
        onClick={() => onChange(slug)}
        aria-pressed={isActive}
        className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
        style={{
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
    <div
      ref={setRowRef}
      className="tag-filter-row flex items-center gap-1 overflow-x-auto whitespace-nowrap"
    >
      {/* "All" clears the sub-filter back to the whole category. */}
      {renderChip(null, t('markets.subtagAll'))}
      {subtags.map((subtag) => renderChip(subtag.slug, subtag.label))}
    </div>
  );
}
