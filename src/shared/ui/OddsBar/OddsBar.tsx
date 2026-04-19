import type { CSSProperties } from 'react';

export interface OddsBarSegment {
  id: string;
  label: string;
  probability: number; // 0..1
  color?: string;
}

export interface OddsBarProps {
  segments: OddsBarSegment[];
  height?: number;
  showLabels?: boolean;
  className?: string;
}

// Visual probability distribution between outcomes.
// For a two-outcome market (Yes/No), renders as a split bar.
// Segments render in order; combined widths normalize to 100%.
export const OddsBar = ({
  segments,
  height = 8,
  showLabels = false,
  className = '',
}: OddsBarProps) => {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.probability), 0);

  // Fallback: evenly split if all probabilities are 0 or invalid
  const normalized = segments.map((s) => ({
    ...s,
    pct: total > 0 ? (Math.max(0, s.probability) / total) * 100 : 100 / segments.length,
  }));

  const defaultColors = ['var(--color-win)', 'var(--color-loss, #ef4444)', 'var(--color-accent)'];

  return (
    <div className={className}>
      <div
        className="flex w-full overflow-hidden rounded-full"
        style={
          {
            height: `${height}px`,
            backgroundColor: 'var(--color-border)',
          } as CSSProperties
        }
        role="img"
        aria-label={normalized.map((s) => `${s.label}: ${Math.round(s.pct)}%`).join(', ')}
      >
        {normalized.map((s, i) => (
          <div
            key={s.id}
            style={{
              width: `${s.pct}%`,
              backgroundColor: s.color ?? defaultColors[i % defaultColors.length],
              transition: 'width 300ms ease-out',
            }}
          />
        ))}
      </div>

      {showLabels && (
        <div className="mt-1 flex justify-between gap-2 text-xs">
          {normalized.map((s, i) => (
            <span
              key={s.id}
              style={{
                color: s.color ?? defaultColors[i % defaultColors.length],
                fontWeight: 600,
              }}
            >
              {s.label} {Math.round(s.pct)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
