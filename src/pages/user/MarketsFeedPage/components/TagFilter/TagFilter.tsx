import { useTranslation } from 'react-i18next';
import type { AllowedCategoryTag } from '@/features/bet';
import './trendingChip.css';

interface TagFilterProps {
  value: string | null;
  onChange: (value: string | null) => void;
  tags: AllowedCategoryTag[];
  myBetsActive?: boolean;
  onMyBetsToggle?: () => void;
  showMyBets?: boolean;
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
}: TagFilterProps) {
  const { t } = useTranslation();

  if (tags.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const isActive = value === tag.slug;
        const isTrending = tag.slug === 'trending';
        const label = t(`markets.tags.${tag.slug}`, { defaultValue: tag.label });

        if (isTrending) {
          return (
            <button
              key={tag.slug}
              onClick={() => onChange(isActive ? null : tag.slug)}
              className={`trending-chip ${isActive ? 'trending-chip--active' : ''}`}
              aria-pressed={isActive}
            >
              <FlameIcon active={isActive} />
              <span>{label}</span>
            </button>
          );
        }

        return (
          <button
            key={tag.slug}
            onClick={() => onChange(isActive ? null : tag.slug)}
            className="rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
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
      <button
        onClick={() => onChange(null)}
        className="rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
        style={{
          backgroundColor:
            value === null
              ? 'var(--color-accent)'
              : 'color-mix(in srgb, var(--color-accent) 3%, var(--color-bg-elevated))',
          color:
            value === null
              ? 'var(--color-bg-base)'
              : 'color-mix(in srgb, var(--color-accent) 25%, var(--color-text-secondary))',
          border: `1px solid ${value === null ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-accent) 12%, var(--color-border))'}`,
        }}
      >
        {t('markets.categoryAll')}
      </button>
      {showMyBets && onMyBetsToggle && (
        <button
          onClick={onMyBetsToggle}
          aria-pressed={myBetsActive}
          className="rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
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
          {t('markets.myBets')}
        </button>
      )}
    </div>
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
