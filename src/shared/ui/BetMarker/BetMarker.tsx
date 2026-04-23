import { useTranslation } from 'react-i18next';

interface BetMarkerProps {
  /** Tooltip override; defaults to the i18n "You have a bet on this" text. */
  title?: string;
  className?: string;
}

/**
 * Minimal at-a-glance indicator that the current user has a bet on this card.
 * Carries no bet details on purpose — the intent is fast scanning across the
 * feed. Uses the accent color so it reads as a small filled pill next to the
 * bookmark / action buttons in a card footer.
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
        borderRadius: 999,
        backgroundColor: 'var(--color-accent)',
        color: 'var(--color-bg-base)',
        flexShrink: 0,
      }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}
