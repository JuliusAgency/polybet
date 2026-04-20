import { useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Side-by-side outcome buttons for binary markets (Polymarket-style).
 * - Uses real outcome names (not hardcoded Yes/No).
 * - Outcome[0] → win tint; outcome[1] → loss tint.
 * - Disabled state renders static pills, still showing odds and price.
 * - Non-binary markets fall back to a vertical stack.
 */

export interface OutcomeButton {
  id: string;
  name: string;
  /** 0..1 probability. */
  price: number | null;
  /** Shown as the primary number. */
  effectiveOdds: number;
  /** True if this outcome is the resolved winner. */
  isWinner?: boolean;
}

type ButtonSize = 'sm' | 'lg';

interface OutcomeButtonsProps {
  outcomes: OutcomeButton[];
  size?: ButtonSize;
  disabled?: boolean;
  onClick?: (outcomeId: string) => void;
  /** Custom CTA label prefix (e.g. "Buy"). If omitted, renders outcome name only. */
  ctaLabel?: string;
  /** Show % next to outcome name. Default true. Disable when a probability bar lives next to the buttons. */
  showPercentage?: boolean;
  /** When true, button shows outcome name by default and swaps to % on hover/focus (Polymarket style). */
  hoverShowsPercentage?: boolean;
  /** Price display format. Default 'percent' (e.g. 8%). Use 'cents' for Polymarket-style (e.g. 8.3¢). */
  priceFormat?: 'percent' | 'cents';
}

const SIZE_STYLES: Record<ButtonSize, { padY: string; padX: string; name: string; odds: string }> =
  {
    lg: {
      padY: 'py-2',
      padX: 'px-3',
      name: 'text-[13px] font-semibold',
      odds: 'text-[13px] font-mono font-semibold',
    },
    sm: {
      padY: 'py-1.5',
      padX: 'px-2.5',
      name: 'text-xs font-medium',
      odds: 'text-xs font-mono font-semibold',
    },
  };

function tintFor(index: number, isWinner: boolean, disabled: boolean): CSSProperties {
  const role = index === 0 ? 'win' : 'loss';
  const tintVar = role === 'win' ? 'var(--color-win)' : 'var(--color-loss)';

  if (isWinner) {
    return {
      backgroundColor: `color-mix(in oklch, ${tintVar} 18%, var(--color-bg-base))`,
      borderColor: `color-mix(in oklch, ${tintVar} 55%, transparent)`,
      color: tintVar,
    };
  }

  return {
    backgroundColor: disabled
      ? 'var(--color-bg-base)'
      : `color-mix(in oklch, ${tintVar} 8%, var(--color-bg-base))`,
    borderColor: `color-mix(in oklch, ${tintVar} 28%, transparent)`,
    color: tintVar,
  };
}

function hoverTintFor(index: number): CSSProperties {
  const tintVar = index === 0 ? 'var(--color-win)' : 'var(--color-loss)';
  return {
    backgroundColor: tintVar,
    borderColor: tintVar,
    color: 'var(--color-text-primary)',
  };
}

function formatPrice(price: number | null, format: 'percent' | 'cents' = 'percent'): string | null {
  if (price == null) return null;
  if (format === 'cents') {
    const cents = price * 100;
    const formatted = cents >= 10 ? cents.toFixed(1) : cents.toFixed(1);
    return `${formatted}¢`;
  }
  return `${Math.round(price * 100)}%`;
}

export function OutcomeButtons({
  outcomes,
  size = 'lg',
  disabled = false,
  onClick,
  ctaLabel,
  showPercentage = true,
  hoverShowsPercentage = false,
  priceFormat = 'percent',
}: OutcomeButtonsProps) {
  const styles = SIZE_STYLES[size];
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Non-binary fallback: vertical list of unstyled row buttons.
  if (outcomes.length !== 2) {
    return (
      <div className="flex flex-col gap-1.5">
        {outcomes.map((o) => {
          const pct = showPercentage ? formatPrice(o.price, priceFormat) : null;
          return (
            <OutcomeRowFallback
              key={o.id}
              outcome={o}
              pct={pct}
              disabled={disabled}
              onClick={onClick}
              size={size}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {outcomes.map((o, index) => {
        const isHovered = hoveredId === o.id && !disabled;
        const baseStyle = tintFor(index, !!o.isWinner, disabled);
        const style: CSSProperties = isHovered ? hoverTintFor(index) : baseStyle;
        const pct = showPercentage ? formatPrice(o.price, priceFormat) : null;
        const hoverPct = hoverShowsPercentage ? formatPrice(o.price, priceFormat) : null;

        const label = ctaLabel ? `${ctaLabel} ${o.name}` : o.name;
        const displayName = hoverShowsPercentage && isHovered && hoverPct ? hoverPct : label;

        const body: ReactNode = (
          <div className="flex items-center justify-center gap-2">
            <span className={styles.name}>{displayName}</span>
            {pct && (
              <span className={styles.odds} style={{ color: 'inherit', opacity: 0.95 }}>
                {pct}
              </span>
            )}
          </div>
        );

        const baseClass = `rounded-lg border ${styles.padY} ${styles.padX} transition-colors`;

        if (disabled || !onClick) {
          return (
            <div
              key={o.id}
              className={baseClass}
              style={{ ...style, opacity: disabled && !o.isWinner ? 0.7 : 1 }}
            >
              {body}
            </div>
          );
        }

        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onClick(o.id)}
            onMouseEnter={() => setHoveredId(o.id)}
            onMouseLeave={() => setHoveredId(null)}
            onFocus={() => setHoveredId(o.id)}
            onBlur={() => setHoveredId(null)}
            className={`${baseClass} cursor-pointer focus-visible:outline-none focus-visible:ring-2`}
            style={{
              ...style,
              transitionDuration: 'var(--duration-fast)',
              transitionTimingFunction: 'var(--ease-out-expo)',
            }}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

function OutcomeRowFallback({
  outcome,
  pct,
  disabled,
  onClick,
  size,
}: {
  outcome: OutcomeButton;
  pct: string | null;
  disabled: boolean;
  onClick?: (outcomeId: string) => void;
  size: ButtonSize;
}) {
  const styles = SIZE_STYLES[size];
  const isWinner = !!outcome.isWinner;
  const style: CSSProperties = {
    backgroundColor: isWinner
      ? 'color-mix(in oklch, var(--color-win) 14%, var(--color-bg-base))'
      : 'var(--color-bg-base)',
    borderColor: isWinner
      ? 'color-mix(in oklch, var(--color-win) 45%, transparent)'
      : 'var(--color-border)',
    color: isWinner ? 'var(--color-win)' : 'var(--color-text-primary)',
  };

  const body = (
    <div className="flex items-center justify-between gap-3">
      <span className={styles.name}>{outcome.name}</span>
      <div className="flex items-center gap-2">
        {pct && (
          <span className={styles.odds} style={{ color: 'var(--color-text-secondary)' }}>
            {pct}
          </span>
        )}
        <span className={styles.odds} style={{ color: 'var(--color-accent)' }}>
          {outcome.effectiveOdds.toFixed(2)}
        </span>
      </div>
    </div>
  );

  const baseClass = `rounded-lg border ${styles.padY} ${styles.padX} transition-colors`;

  if (disabled || !onClick) {
    return (
      <div className={baseClass} style={style}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onClick(outcome.id)}
      className={`${baseClass} cursor-pointer hover:brightness-110`}
      style={style}
    >
      {body}
    </button>
  );
}
