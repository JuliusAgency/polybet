import { useTranslation } from 'react-i18next';

interface BetMarkerProps {
  /** Tooltip override; defaults to the i18n "You have a bet on this" text. */
  title?: string;
  className?: string;
}

/**
 * Minimal at-a-glance indicator that the current user has a bet on this card.
 * Carries no bet details on purpose — the intent is fast scanning across the
 * feed. Uses the same bullseye glyph and accent color as the "My bets" tag
 * chip so the two UI elements read as a matched pair.
 */
export function BetMarker({ title, className }: BetMarkerProps) {
  const { t } = useTranslation();
  const label = title ?? t('markets.betPlacedMarker', { defaultValue: 'You have a bet here' });

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
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
    </span>
  );
}
