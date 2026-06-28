import { useState, type CSSProperties, type ReactNode } from 'react';
import { formatProbability, formatSharePrice } from '@/shared/utils';

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
  /** True if this side cannot be bet on at all (e.g. no Polymarket token id). */
  untradable?: boolean;
}

type ButtonSize = 'sm' | 'lg' | 'xl';

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
  /**
   * When set, marks the matching outcome as selected (intensified, aria-pressed)
   * and dims the others. Use for in-slip Yes/No selection (BetSlip). When unset
   * the component behaves as a plain action group (feed/event-row).
   */
  selectedId?: string;
  /**
   * Visual treatment for non-bettable surfaces.
   *  - 'default': disabled pills keep the win/loss colour tint (used by the
   *    user feed so closed/resolved markets still read with their odds).
   *  - 'inactive': disabled pills render as neutral, muted, cursor-not-allowed
   *    pills with NO win/loss tint — used only by the admin/manager read-only
   *    Markets surface so betting reads as unmistakably switched off. Winner
   *    outcomes still keep their win tint so resolved results stay legible.
   *  - 'solid': Polymarket trade-panel look — the selected/winner side is filled
   *    solid with its win/loss colour and white text; the other side is a flat
   *    neutral grey. Used by the BetSlip side panel.
   *  - 'fill': Polymarket feed look — BOTH sides solid-tinted (green Yes / red
   *    No) regardless of winner, so an open binary card reads as filled inline
   *    pills. Used by the feed/event cards (MarketCard, EventCard).
   */
  appearance?: 'default' | 'inactive' | 'solid' | 'fill';
}

const SIZE_STYLES: Record<ButtonSize, { padY: string; padX: string; name: string; odds: string }> =
  {
    xl: {
      padY: 'py-3',
      padX: 'px-4',
      name: 'text-sm font-semibold',
      odds: 'text-sm num font-semibold',
    },
    lg: {
      padY: 'py-2',
      padX: 'px-3',
      name: 'text-[13px] font-semibold',
      odds: 'text-[13px] num font-semibold',
    },
    sm: {
      padY: 'py-1.5',
      padX: 'px-2.5',
      name: 'text-xs font-medium',
      odds: 'text-xs num font-semibold',
    },
  };

function tintFor(
  index: number,
  isWinner: boolean,
  disabled: boolean,
  appearance: 'default' | 'inactive' | 'solid' | 'fill' = 'default'
): CSSProperties {
  const role = index === 0 ? 'win' : 'loss';
  const tintVar = role === 'win' ? 'var(--color-win)' : 'var(--color-loss)';

  // Polymarket trade-panel look: selected/winner side filled solid with white
  // text; the other side a flat neutral grey.
  if (appearance === 'solid') {
    if (isWinner) {
      return { backgroundColor: tintVar, borderColor: tintVar, color: '#ffffff' };
    }
    return {
      backgroundColor: 'var(--color-bg-base)',
      borderColor: 'var(--color-border)',
      color: 'var(--color-text-secondary)',
    };
  }

  if (isWinner) {
    return {
      backgroundColor: `color-mix(in oklch, ${tintVar} 18%, var(--color-bg-base))`,
      borderColor: `color-mix(in oklch, ${tintVar} 55%, transparent)`,
      color: tintVar,
    };
  }

  // Feed look: BOTH sides solid-tinted (green Yes / red No) regardless of winner,
  // so an open binary card reads as Polymarket's filled inline pills (F2). A
  // stronger-than-default mix (16% vs default 8%) reads "filled" while keeping
  // the green/red text legible in the light theme; white-text-on-100%-fill is
  // the 'solid' selected look reserved for the BetSlip.
  if (appearance === 'fill') {
    return {
      backgroundColor: `color-mix(in oklch, ${tintVar} 16%, var(--color-bg-base))`,
      borderColor: `color-mix(in oklch, ${tintVar} 40%, transparent)`,
      color: tintVar,
    };
  }

  // Read-only admin/manager surface: strip the win/loss tint entirely so the
  // pill reads as switched off rather than a coloured action. Winner pills are
  // handled above and keep their tint regardless of appearance.
  if (appearance === 'inactive') {
    return {
      backgroundColor: 'var(--color-bg-base)',
      borderColor: 'var(--color-border)',
      color: 'var(--color-text-muted)',
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
    return formatSharePrice(price);
  }
  return formatProbability(price);
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
  selectedId,
  appearance = 'default',
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
        const isUntradable = !!o.untradable && !o.isWinner;
        const isSelected = selectedId != null && o.id === selectedId;
        // In selection mode, dim the outcomes that are not chosen.
        const isDimmed = selectedId != null && !isSelected && !o.isWinner;
        const isHovered = hoveredId === o.id && !disabled && !isUntradable;
        const baseStyle = tintFor(
          index,
          !!o.isWinner || isSelected,
          disabled || isUntradable,
          appearance
        );
        // Solid mode keeps its flat fills on hover (no win/loss recolour); a
        // light brightness bump on the neutral side signals interactivity.
        const style: CSSProperties =
          isHovered && appearance !== 'solid'
            ? hoverTintFor(index)
            : {
                ...baseStyle,
                ...(isDimmed ? { opacity: 0.5 } : null),
                ...(isHovered && appearance === 'solid' ? { filter: 'brightness(1.05)' } : null),
              };
        const pct = showPercentage ? formatPrice(o.price, priceFormat) : null;
        const hoverPct = hoverShowsPercentage ? formatPrice(o.price, priceFormat) : null;

        const label = ctaLabel ? `${ctaLabel} ${o.name}` : o.name;
        const displayName = hoverShowsPercentage && isHovered && hoverPct ? hoverPct : label;

        const body: ReactNode = (
          <div className="flex min-w-0 items-center justify-center gap-2">
            <span className={`${styles.name} min-w-0 break-words text-center line-clamp-2`}>
              {displayName}
            </span>
            {pct && (
              <span
                className={`${styles.odds} shrink-0`}
                style={{ color: 'inherit', opacity: 0.95 }}
              >
                {pct}
              </span>
            )}
          </div>
        );

        const baseClass = `rounded-lg border ${styles.padY} ${styles.padX} transition-colors`;

        if (disabled || isUntradable || !onClick) {
          const dimmed = (disabled || isUntradable) && !o.isWinner;
          const isInactive = appearance === 'inactive' && !o.isWinner;
          return (
            <div
              key={o.id}
              className={`${baseClass}${isInactive ? ' cursor-not-allowed' : ''}`}
              style={{ ...style, opacity: dimmed ? 0.55 : 1 }}
              aria-disabled={isUntradable || isInactive || undefined}
            >
              {body}
            </div>
          );
        }

        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={selectedId != null ? isSelected : undefined}
            onClick={(e) => {
              onClick(o.id);
              // Clear the hover/focus highlight on tap so the pill doesn't stay
              // stuck in its solid-fill "+%" state. On touch a tap both focuses
              // the pill AND fires mouse-compat enter (with no matching leave),
              // so we reset the state directly AND blur — otherwise the feed pill
              // stays highlighted after the BetSlip is opened and then dismissed
              // by swiping the sheet (which never blurs/leaves the trigger).
              setHoveredId(null);
              e.currentTarget.blur();
            }}
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
