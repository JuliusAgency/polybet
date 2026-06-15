import { useTranslation } from 'react-i18next';
import { CLOSING_TODAY_TAG_SLUG } from '@/entities/market';
import type { AllowedCategoryTag } from '@/features/bet';
import './trendingChip.css';
import './worldCupChip.css';

const WORLD_CUP_TAG_SLUG = 'world-cup';

interface TagFilterProps {
  value: string | null;
  onChange: (value: string | null) => void;
  tags: AllowedCategoryTag[];
  myBetsActive?: boolean;
  onMyBetsToggle?: () => void;
  showMyBets?: boolean;
  savedActive?: boolean;
  /** When provided, a Saved chip is rendered inside the category row (next to
   *  My bets). Toggles the saved-only feed view. */
  onSavedToggle?: () => void;
  /** Count of cards on the Saved tab, shown as a badge on the Saved chip. */
  savedCount?: number;
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
export function TagFilter({
  value,
  onChange,
  tags,
  myBetsActive = false,
  onMyBetsToggle,
  showMyBets = false,
  savedActive = false,
  onSavedToggle,
  savedCount,
}: TagFilterProps) {
  const { t } = useTranslation();

  if (tags.length === 0) return null;

  // My bets and Saved both own the feed intent — when either is on, no tag
  // chip (including the "All categories" fallback) should look active.
  const effectiveValue = myBetsActive || savedActive ? undefined : value;

  // Pull Trending and World Cup out so we can render them as signature chips
  // (cyan flame / gold trophy) and slot "Closing today" right after them; the
  // rest keeps Polymarket's original ordering.
  const trendingTag = tags.find((tag) => tag.slug === 'trending') ?? null;
  const worldCupTag = tags.find((tag) => tag.slug === WORLD_CUP_TAG_SLUG) ?? null;
  const restTags = tags.filter((tag) => tag.slug !== 'trending' && tag.slug !== WORLD_CUP_TAG_SLUG);

  return (
    <div className="tag-filter-row flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
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
            className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: isActive
                ? 'var(--color-accent)'
                : 'color-mix(in srgb, var(--color-accent) 3%, var(--color-bg-elevated))',
              color: isActive
                ? 'var(--color-bg-base)'
                : 'color-mix(in srgb, var(--color-accent) 25%, var(--color-text-secondary))',
              border: `1px solid ${isActive ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-accent) 12%, var(--color-border))'}`,
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
            className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: isActive
                ? 'var(--color-accent)'
                : 'color-mix(in srgb, var(--color-accent) 3%, var(--color-bg-elevated))',
              color: isActive
                ? 'var(--color-bg-base)'
                : 'color-mix(in srgb, var(--color-accent) 25%, var(--color-text-secondary))',
              border: `1px solid ${isActive ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-accent) 12%, var(--color-border))'}`,
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
            className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: isActive
                ? 'var(--color-accent)'
                : 'color-mix(in srgb, var(--color-accent) 3%, var(--color-bg-elevated))',
              color: isActive
                ? 'var(--color-bg-base)'
                : 'color-mix(in srgb, var(--color-accent) 25%, var(--color-text-secondary))',
              border: `1px solid ${isActive ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-accent) 12%, var(--color-border))'}`,
            }}
          >
            {t('markets.categoryAll')}
          </button>
        );
      })()}
      {onSavedToggle && (
        <button
          onClick={onSavedToggle}
          aria-pressed={savedActive}
          className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor: savedActive
              ? 'var(--color-accent)'
              : 'color-mix(in srgb, var(--color-accent) 3%, var(--color-bg-elevated))',
            color: savedActive
              ? 'var(--color-bg-base)'
              : 'color-mix(in srgb, var(--color-accent) 25%, var(--color-text-secondary))',
            border: `1px solid ${savedActive ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-accent) 12%, var(--color-border))'}`,
          }}
        >
          <BookmarkIcon active={savedActive} />
          <span>{t('markets.savedButton')}</span>
          {typeof savedCount === 'number' && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none"
              style={{
                backgroundColor: savedActive ? 'var(--color-bg-base)' : 'var(--color-accent)',
                color: savedActive ? 'var(--color-accent)' : 'var(--color-bg-base)',
              }}
            >
              {savedCount}
            </span>
          )}
        </button>
      )}
      {showMyBets && onMyBetsToggle && (
        <button
          onClick={onMyBetsToggle}
          aria-pressed={myBetsActive}
          className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor: myBetsActive
              ? 'var(--color-accent)'
              : 'color-mix(in srgb, var(--color-accent) 3%, var(--color-bg-elevated))',
            color: myBetsActive
              ? 'var(--color-bg-base)'
              : 'color-mix(in srgb, var(--color-accent) 25%, var(--color-text-secondary))',
            border: `1px solid ${myBetsActive ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-accent) 12%, var(--color-border))'}`,
          }}
        >
          <TargetIcon />
          <span>{t('markets.myBets')}</span>
        </button>
      )}
    </div>
  );
}

function TargetIcon() {
  // Bullseye — three concentric circles, center dot filled. Not used elsewhere
  // in the app (bookmark is taken by Saved/BookmarkButton, check by BetMarker,
  // flame by Trending, clock by Closing today). Reads as "you aimed, you
  // placed your bet" which matches the My bets semantics.
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
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
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

interface BookmarkIconProps {
  active: boolean;
}

function BookmarkIcon({ active }: BookmarkIconProps) {
  // Bookmark — matches the Saved/BookmarkButton semantics elsewhere in the app.
  // Filled when the saved-only view is active, outline otherwise.
  return (
    <svg
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
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
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
