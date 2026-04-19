/**
 * Circular probability gauge (conic-gradient). Shows the leading outcome's % plus
 * its first letter in the center. Color shifts toward win when >= 50%, loss when < 50%.
 */

type GaugeSize = 'sm' | 'lg';

interface ProbabilityGaugeProps {
  /** Probability from 0 to 1. */
  probability: number;
  /** Leading outcome name (e.g. "Yes", "Kamala Harris"). Used for the center glyph. */
  leaderName: string;
  size?: GaugeSize;
  /** Optional aria label override. */
  ariaLabel?: string;
}

const SIZE_MAP: Record<
  GaugeSize,
  { outer: number; track: number; inner: number; pctFont: number; glyphFont: number }
> = {
  sm: { outer: 22, track: 3, inner: 16, pctFont: 9, glyphFont: 8 },
  lg: { outer: 44, track: 5, inner: 34, pctFont: 13, glyphFont: 10 },
};

export function ProbabilityGauge({
  probability,
  leaderName,
  size = 'lg',
  ariaLabel,
}: ProbabilityGaugeProps) {
  const clamped = Math.max(0, Math.min(1, probability));
  const percent = Math.round(clamped * 100);
  const dims = SIZE_MAP[size];

  const leaning = clamped >= 0.5;
  const arcColor = leaning ? 'var(--color-win)' : 'var(--color-loss)';
  const trackColor = 'var(--color-border)';

  const conic = `conic-gradient(${arcColor} 0 ${percent}%, ${trackColor} ${percent}% 100%)`;

  const glyph = leaderName.trim().charAt(0).toUpperCase();

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? `${percent}% ${leaderName}`}
      className="relative shrink-0"
      style={{
        width: dims.outer,
        height: dims.outer,
        borderRadius: '9999px',
        background: conic,
      }}
    >
      <div
        className="absolute inset-0 m-auto flex items-center justify-center"
        style={{
          width: dims.inner,
          height: dims.inner,
          borderRadius: '9999px',
          backgroundColor: 'var(--color-bg-surface)',
          top: dims.track,
          left: dims.track,
        }}
      >
        {size === 'lg' ? (
          <div className="flex flex-col items-center leading-none">
            <span
              className="font-mono font-semibold"
              style={{ fontSize: dims.pctFont, color: 'var(--color-text-primary)' }}
            >
              {percent}%
            </span>
            <span
              className="font-medium"
              style={{
                fontSize: dims.glyphFont,
                color: 'var(--color-text-secondary)',
                marginTop: 1,
              }}
            >
              {glyph}
            </span>
          </div>
        ) : (
          <span
            className="font-mono font-semibold"
            style={{ fontSize: dims.pctFont, color: 'var(--color-text-primary)' }}
          >
            {percent}
          </span>
        )}
      </div>
    </div>
  );
}
