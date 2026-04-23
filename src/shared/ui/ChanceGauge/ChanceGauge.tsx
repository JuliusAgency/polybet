import { useTranslation } from 'react-i18next';

interface ChanceGaugeProps {
  /** Probability in [0, 1] (Yes-outcome price). null / undefined renders nothing. */
  value: number | null | undefined;
  /** Rendered gauge diameter in px. The component scales internal strokes / text proportionally. */
  size?: number;
  /** Override label under the percent (defaults to i18n `markets.chance`). */
  label?: string;
  className?: string;
}

/**
 * Polymarket-inspired probability gauge: a half-circle arc where the filled
 * portion reflects the probability, a leading dot marks the track start, and
 * the probability is printed below as `NN%` with a small "chance" caption.
 *
 * Shared because both MarketCard and EventCard (single-market branch) render
 * the same visual — keeping one component prevents drift between the two.
 */
export function ChanceGauge({ value, size = 56, label, className }: ChanceGaugeProps) {
  const { t } = useTranslation();

  if (value == null || !Number.isFinite(value)) return null;

  const pct = Math.max(0, Math.min(1, value));
  const percentInt = Math.round(pct * 100);

  // Geometry — arc occupies the upper half of a square viewBox; the bottom
  // half holds the percentage text.
  const vb = 64;
  const cx = vb / 2;
  const cy = 36;
  const r = 26;
  const stroke = 6;

  // Endpoint of the filled arc. pi = leftmost, 0 = rightmost (sweeping over top).
  const angle = Math.PI - pct * Math.PI;
  const ex = cx + r * Math.cos(angle);
  const ey = cy - r * Math.sin(angle);

  // Paths. In SVG's y-down user coords, sweep-flag=1 traces the arc clockwise,
  // which on screen routes the curve OVER the top (giving a semicircle that
  // opens downward — matches the Polymarket reference). The filled arc is
  // always the shorter of the two candidate arcs, so large-arc-flag=0.
  const bgPath = `M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`;
  const fgPath = `M ${cx - r},${cy} A ${r},${r} 0 0 1 ${ex.toFixed(3)},${ey.toFixed(3)}`;

  const trackColor = 'color-mix(in srgb, var(--color-text-muted) 30%, transparent)';
  const fillColor = 'var(--color-accent)';
  const resolvedLabel = label ?? t('markets.chance');

  return (
    <div
      className={className}
      style={{
        width: size,
        display: 'inline-flex',
        lineHeight: 1,
      }}
      role="img"
      aria-label={`${percentInt}% ${resolvedLabel}`}
    >
      <svg viewBox={`0 0 ${vb} ${vb}`} width={size} height={size} aria-hidden="true">
        {/* Background track */}
        <path
          d={bgPath}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Filled progress */}
        {pct > 0 && (
          <path
            d={fgPath}
            fill="none"
            stroke={fillColor}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        )}
        {/* Leading dot — anchors the eye at the start of the track, same as Polymarket */}
        <circle cx={cx - r} cy={cy} r={stroke / 2 + 0.5} fill={fillColor} />

        {/* Percentage — tight under the arc baseline */}
        <text
          x={cx}
          y={cy + 8}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fill: 'var(--color-text-primary)',
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            fontSize: 13,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {percentInt}%
        </text>
        {/* Caption — stacked directly under the percentage, inside the SVG
            so the two share a single layout box (no CSS negative margin trick). */}
        <text
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fill: 'var(--color-text-secondary)',
            fontFamily: 'var(--font-sans)',
            fontSize: 9,
            letterSpacing: 0.3,
          }}
        >
          {resolvedLabel}
        </text>
      </svg>
    </div>
  );
}
