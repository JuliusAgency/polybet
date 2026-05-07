import { useTranslation } from 'react-i18next';

interface BetMarkerProps {
  /** Tooltip override; defaults to the i18n "You have a bet on this" text. */
  title?: string;
  className?: string;
  /**
   * Number of bets the user has on this market/event. When > 1 a small
   * count badge is rendered next to the bullseye so a market with multiple
   * bets reads as multiple — keeping My Bets visually consistent with
   * the In-Play count which sums every open bet (Bug 3).
   */
  count?: number;
}

/**
 * Minimal at-a-glance indicator that the current user has a bet on this card.
 * Carries no bet details on purpose — the intent is fast scanning across the
 * feed. Uses the same bullseye glyph and accent color as the "My bets" tag
 * chip so the two UI elements read as a matched pair.
 */
export function BetMarker({ title, className, count }: BetMarkerProps) {
  const { t } = useTranslation();
  const showCount = typeof count === 'number' && count > 1;
  const label =
    title ??
    (showCount
      ? t('markets.betPlacedMarkerCount', { count, defaultValue: '{{count}} bets on this' })
      : t('markets.betPlacedMarker'));

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        color: 'var(--color-accent)',
        flexShrink: 0,
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
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      </svg>
      {showCount && (
        <span
          aria-hidden="true"
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            fontSize: 11,
            lineHeight: 1,
            color: 'var(--color-accent)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          ×{count}
        </span>
      )}
    </span>
  );
}
