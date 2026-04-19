import type { CSSProperties } from 'react';

/**
 * Thin horizontal probability bar for market outcomes.
 * - Binary markets: two-segment bar with name + % labels on each side.
 * - Non-binary (3+): multi-segment bar, no labels.
 * - Null prices: flat placeholder track.
 *
 * Color mapping mirrors OutcomeButtons: outcome[0] → win tint, outcome[1] → loss tint.
 * For 3+ outcomes, segments cycle through win / loss / accent with muted blends.
 */

export interface OutcomeProbabilityBarItem {
  id: string;
  name: string;
  /** 0..1 probability. */
  price: number | null;
  /** True if this outcome is the resolved winner. */
  isWinner?: boolean;
}

interface OutcomeProbabilityBarProps {
  outcomes: OutcomeProbabilityBarItem[];
  /** Bar thickness in px. Default 3. */
  height?: number;
  /** Show name + % labels above the bar (binary only). Default true. */
  showLabels?: boolean;
}

const SEGMENT_COLORS: string[] = ['var(--color-win)', 'var(--color-loss)', 'var(--color-accent)'];

function segmentColor(index: number): string {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}

function formatPercent(price: number | null): string {
  if (price == null) return '—';
  return `${Math.round(price * 100)}%`;
}

export function OutcomeProbabilityBar({
  outcomes,
  height = 3,
  showLabels = true,
}: OutcomeProbabilityBarProps) {
  const hasData = outcomes.some((o) => o.price != null);
  const isBinary = outcomes.length === 2;
  const anyResolved = outcomes.some((o) => o.isWinner);

  const barTransition = 'flex-basis var(--duration-base) var(--ease-out-expo)';

  // No prices yet: placeholder track, no labels.
  if (!hasData) {
    return (
      <div
        className="w-full rounded-full"
        style={{
          height,
          backgroundColor: 'var(--color-border)',
        }}
        role="presentation"
      />
    );
  }

  if (isBinary) {
    const [left, right] = outcomes;
    const leftRaw = left.price ?? 0;
    const rightRaw = right.price ?? 0;
    const total = leftRaw + rightRaw;
    const leftShare = total > 0 ? leftRaw / total : 0.5;
    const leftPct = Math.round(leftShare * 100);
    const rightPct = 100 - leftPct;
    const leftColor = segmentColor(0);
    const rightColor = segmentColor(1);

    const segmentOpacity = (outcome: OutcomeProbabilityBarItem): number => {
      if (!anyResolved) return 1;
      return outcome.isWinner ? 1 : 0.4;
    };

    return (
      <div
        className="w-full"
        role="img"
        aria-label={`${left.name} ${leftPct}% / ${right.name} ${rightPct}%`}
      >
        {showLabels && (
          <div
            className="flex items-center justify-between text-[11px] leading-none"
            style={{ marginBottom: 6 }}
          >
            <LabelPair
              name={left.name}
              percent={formatPercent(left.price)}
              color={leftColor}
              align="start"
            />
            <LabelPair
              name={right.name}
              percent={formatPercent(right.price)}
              color={rightColor}
              align="end"
            />
          </div>
        )}

        <div
          className="flex w-full overflow-hidden"
          style={{
            height,
            borderRadius: 9999,
            backgroundColor: 'var(--color-bg-base)',
            boxShadow: 'inset 0 1px 2px oklch(0% 0 0 / 0.45)',
          }}
        >
          <div
            style={{
              flexBasis: `${leftPct}%`,
              backgroundColor: leftColor,
              opacity: segmentOpacity(left),
              transition: barTransition,
            }}
          />
          <div
            style={{
              flexBasis: `${rightPct}%`,
              backgroundColor: rightColor,
              opacity: segmentOpacity(right),
              transition: barTransition,
            }}
          />
        </div>
      </div>
    );
  }

  // Non-binary: multi-segment bar without labels.
  const totalKnown = outcomes.reduce((sum, o) => sum + (o.price ?? 0), 0);
  const normalize = totalKnown > 0 ? 1 / totalKnown : 0;

  return (
    <div
      className="flex w-full overflow-hidden"
      style={{
        height,
        borderRadius: 9999,
        backgroundColor: 'var(--color-bg-base)',
        boxShadow: 'inset 0 1px 2px oklch(0% 0 0 / 0.45)',
      }}
      role="img"
      aria-label={outcomes.map((o) => `${o.name} ${formatPercent(o.price)}`).join(', ')}
    >
      {outcomes.map((o, index) => {
        const share = (o.price ?? 0) * normalize;
        const pct = Math.max(0, Math.round(share * 100));
        const segStyle: CSSProperties = {
          flexBasis: `${pct}%`,
          backgroundColor: segmentColor(index),
          opacity: anyResolved ? (o.isWinner ? 1 : 0.35) : 1,
          transition: barTransition,
        };
        return <div key={o.id} style={segStyle} />;
      })}
    </div>
  );
}

interface LabelPairProps {
  name: string;
  percent: string;
  color: string;
  align: 'start' | 'end';
}

function LabelPair({ name, percent, color, align }: LabelPairProps) {
  const nameNode = (
    <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>
      {name}
    </span>
  );
  const pctNode = (
    <span className="font-mono font-semibold" style={{ color }}>
      {percent}
    </span>
  );

  return (
    <span className="flex items-baseline gap-1.5">
      {align === 'start' ? (
        <>
          {nameNode}
          {pctNode}
        </>
      ) : (
        <>
          {pctNode}
          {nameNode}
        </>
      )}
    </span>
  );
}
