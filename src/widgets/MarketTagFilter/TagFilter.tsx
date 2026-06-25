import { useTranslation } from 'react-i18next';
import { CLOSING_TODAY_TAG_SLUG } from '@/entities/market';
import { useHorizontalScroll } from '@/shared/hooks/useHorizontalScroll';
import type { AllowedCategoryTag } from '@/features/bet';
import './trendingChip.css';
import './worldCupChip.css';

const WORLD_CUP_TAG_SLUG = 'world-cup';

interface TagFilterProps {
  value: string | null;
  onChange: (value: string | null) => void;
  tags: AllowedCategoryTag[];
  /** When Saved or My bets owns the feed intent (both clear the tag), no
   *  category chip — including the "All categories" fallback — should read as
   *  active. Saved + My bets themselves now live next to the search input. */
  suppressActiveChip?: boolean;
}

/**
 * Horizontal chip row for Polymarket-style popular categories.
 * The list is driven by system_settings.allowed_category_tags (migration 053)
 * and should stay in sync with the market-tracker whitelist.
 *
 * "Trending" is a signature chip — same silhouette as the others, but with a
 * cyan hue-shift, a small flame glyph, and a slow ambient pulse so it reads
 * as "alive" without breaking the dark/blue palette.
 */
export function TagFilter({ value, onChange, tags, suppressActiveChip = false }: TagFilterProps) {
  const { t } = useTranslation();
  const setRowRef = useHorizontalScroll<HTMLDivElement>();

  if (tags.length === 0) return null;

  // When Saved or My bets owns the feed intent, no tag chip (including the
  // "All categories" fallback) should look active.
  const effectiveValue = suppressActiveChip ? undefined : value;

  // Pull Trending and World Cup out so we can render them as signature chips
  // (cyan flame / gold trophy) and slot "Closing today" right after them; the
  // rest keeps Polymarket's original ordering.
  const trendingTag = tags.find((tag) => tag.slug === 'trending') ?? null;
  const worldCupTag = tags.find((tag) => tag.slug === WORLD_CUP_TAG_SLUG) ?? null;
  const restTags = tags.filter((tag) => tag.slug !== 'trending' && tag.slug !== WORLD_CUP_TAG_SLUG);

  return (
    <div
      ref={setRowRef}
      className="tag-filter-row flex items-center gap-1.5 overflow-x-auto whitespace-nowrap"
    >
      {trendingTag &&
        (() => {
          const isActive = effectiveValue === trendingTag.slug;
          const label = t(`markets.tags.${trendingTag.slug}`, {
            defaultValue: trendingTag.label,
          });
          return (
            <button
              key={trendingTag.slug}
              onClick={() => onChange(isActive ? null : trendingTag.slug)}
              className={`trending-chip shrink-0 ${isActive ? 'trending-chip--active' : ''}`}
              aria-pressed={isActive}
            >
              <FlameIcon active={isActive} />
              <span>{label}</span>
            </button>
          );
        })()}
      {worldCupTag &&
        (() => {
          const isActive = effectiveValue === worldCupTag.slug;
          const label = t(`markets.tags.${worldCupTag.slug}`, {
            defaultValue: worldCupTag.label,
          });
          return (
            <button
              key={worldCupTag.slug}
              onClick={() => onChange(isActive ? null : worldCupTag.slug)}
              className={`world-cup-chip shrink-0 ${isActive ? 'world-cup-chip--active' : ''}`}
              aria-pressed={isActive}
            >
              <TrophyIcon />
              <span>{label}</span>
            </button>
          );
        })()}
      {(() => {
        const isActive = effectiveValue === CLOSING_TODAY_TAG_SLUG;
        return (
          <button
            onClick={() => onChange(isActive ? null : CLOSING_TODAY_TAG_SLUG)}
            aria-pressed={isActive}
            className="tag-link flex shrink-0 items-center gap-1 bg-transparent px-1.5 py-1 text-sm transition-colors"
            style={{
              color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontWeight: isActive ? 700 : 500,
            }}
          >
            <ClockIcon />
            <span>{t('markets.closingToday')}</span>
          </button>
        );
      })()}
      {restTags.map((tag) => {
        const isActive = effectiveValue === tag.slug;
        const label = t(`markets.tags.${tag.slug}`, { defaultValue: tag.label });

        return (
          <button
            key={tag.slug}
            onClick={() => onChange(isActive ? null : tag.slug)}
            aria-pressed={isActive}
            className="tag-link shrink-0 bg-transparent px-1.5 py-1 text-sm transition-colors"
            style={{
              color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontWeight: isActive ? 700 : 500,
            }}
          >
            {label}
          </button>
        );
      })}
      {(() => {
        const isActive = effectiveValue === null;
        return (
          <button
            onClick={() => onChange(null)}
            aria-pressed={isActive}
            className="tag-link shrink-0 bg-transparent px-1.5 py-1 text-sm transition-colors"
            style={{
              color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontWeight: isActive ? 700 : 500,
            }}
          >
            {t('markets.categoryAll')}
          </button>
        );
      })()}
    </div>
  );
}

function TrophyIcon() {
  // Trophy — reads as "World Cup / championship". Gold is supplied by the
  // chip's currentColor so it tracks the active/inactive gold states.
  return (
    <svg
      className="world-cup-chip__trophy"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

interface FlameIconProps {
  active: boolean;
}

function FlameIcon({ active }: FlameIconProps) {
  return (
    <svg
      className="trending-chip__flame"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}
