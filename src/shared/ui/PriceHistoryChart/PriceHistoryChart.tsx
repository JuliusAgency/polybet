import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PriceHistoryPoint } from '@/shared/types/priceHistory';

// Structural subset of OutcomeForChart needed by the chart. Defined locally so
// shared/ does not import from features/ (FSD violation) or entities/ (also
// forbidden — shared must not import above its own layer).
interface OutcomeForChart {
  id: string;
  name: string;
  price: number | null;
}
import { Spinner } from '@/shared/ui/Spinner';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { formatProbability } from '@/shared/utils';
import { pickOutcomeColor } from './priceHistoryPalette';

// Px reserved on the right of the plot for the end-of-line "<name> <pct>" labels.
const LABEL_MARGIN_DESKTOP = 120;
const LABEL_MARGIN_NARROW = 76;
const LABEL_GAP = 8;

function truncateName(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, Math.max(1, max - 1))}…` : name;
}

interface LineEndLabelProps {
  index?: number;
  // recharts hands these to the label renderer with a very wide union type; keep
  // them `unknown` (so recharts' Props stays assignable to this) and narrow below.
  x?: unknown;
  y?: unknown;
  value?: unknown;
}

/**
 * End-of-line label: renders the outcome name + its current % at the rightmost
 * point of each line so the graph self-identifies its lines (e.g. "Argentina
 * 68%"). recharts calls the label renderer for EVERY data point, so this draws
 * only at the last index and returns an empty group elsewhere.
 */
function renderLineEndLabel(
  props: LineEndLabelProps,
  lastIndex: number,
  name: string,
  fallbackPrice: number | null,
  color: string,
  isNarrow: boolean
) {
  const { index, x, y, value } = props;
  const px = typeof x === 'number' ? x : Number(x);
  const py = typeof y === 'number' ? y : Number(y);
  if (index !== lastIndex || !Number.isFinite(px) || !Number.isFinite(py)) return <g />;
  const pct = typeof value === 'number' ? value : fallbackPrice;
  const shown = truncateName(name, isNarrow ? 10 : 16);
  const text = pct == null ? shown : `${shown} ${formatProbability(pct)}`;
  return (
    <text
      x={px + LABEL_GAP}
      y={py}
      dy="0.32em"
      fontSize={isNarrow ? 10 : 11}
      fontWeight={600}
      fill={color}
      textAnchor="start"
    >
      {text}
    </text>
  );
}

interface PriceHistoryChartProps {
  points: PriceHistoryPoint[];
  outcomes: OutcomeForChart[];
  isLoading?: boolean;
  height?: number;
}

interface ChartRow {
  ts: number;
  [outcomeId: string]: number;
}

function buildChartRows(points: PriceHistoryPoint[], outcomes: OutcomeForChart[]): ChartRow[] {
  // Collect all bucket timestamps, then pivot by outcome_id with forward-fill
  // so a missing bucket for an outcome still renders as a continuous line.
  const byTs = new Map<number, Record<string, number>>();
  for (const p of points) {
    const ts = new Date(p.bucket_ts).getTime();
    const row = byTs.get(ts) ?? {};
    row[p.outcome_id] = p.price;
    byTs.set(ts, row);
  }

  const sortedTs = [...byTs.keys()].sort((a, b) => a - b);
  if (sortedTs.length === 0) {
    // Fallback: single point from current outcome prices (new market with no history)
    const now = Date.now();
    const single: ChartRow = { ts: now };
    for (const o of outcomes) {
      if (o.price != null) single[o.id] = o.price;
    }
    return Object.keys(single).length > 1 ? [single] : [];
  }

  const lastKnown = new Map<string, number>();
  const rows: ChartRow[] = [];
  for (const ts of sortedTs) {
    const bucket = byTs.get(ts) ?? {};
    for (const [outcomeId, price] of Object.entries(bucket)) {
      lastKnown.set(outcomeId, price);
    }
    const row: ChartRow = { ts };
    for (const o of outcomes) {
      const known = lastKnown.get(o.id);
      if (known != null) row[o.id] = known;
    }
    rows.push(row);
  }

  // Ensure the last row reflects current prices so the line ends at "now".
  const now = Date.now();
  if (rows[rows.length - 1].ts < now - 60_000) {
    const row: ChartRow = { ts: now };
    for (const o of outcomes) {
      const known = lastKnown.get(o.id) ?? o.price;
      if (known != null) row[o.id] = known;
    }
    rows.push(row);
  }

  return rows;
}

function formatAxisTime(ts: number, locale: string, span: number): string {
  const d = new Date(ts);
  const DAY = 24 * 60 * 60 * 1000;
  const loc = locale === 'he' ? 'he-IL' : undefined;
  if (span < 2 * DAY) {
    return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(loc, { month: 'short', day: 'numeric' });
}

function formatTooltipTime(ts: number, locale: string): string {
  const loc = locale === 'he' ? 'he-IL' : undefined;
  return new Date(ts).toLocaleString(loc, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const PriceHistoryChart = ({
  points,
  outcomes,
  isLoading = false,
  height = 260,
}: PriceHistoryChartProps) => {
  const { t, i18n } = useTranslation();
  const isNarrow = useMediaQuery('(max-width: 640px)');
  const rows = useMemo(() => buildChartRows(points, outcomes), [points, outcomes]);
  const span = rows.length > 1 ? rows[rows.length - 1].ts - rows[0].ts : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <Spinner size="md" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm"
        style={{ height, color: 'var(--color-text-secondary)' }}
      >
        {t('priceHistory.empty')}
      </div>
    );
  }

  return (
    <div style={{ height, direction: 'ltr' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{
            top: 8,
            right: isNarrow ? LABEL_MARGIN_NARROW : LABEL_MARGIN_DESKTOP,
            left: 0,
            bottom: 0,
          }}
        >
          <CartesianGrid
            stroke="var(--color-border-subtle)"
            strokeDasharray="2 4"
            vertical={false}
          />
          <XAxis
            dataKey="ts"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => formatAxisTime(v, i18n.language, span)}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            stroke="var(--color-border)"
            minTickGap={40}
          />
          <YAxis
            // Auto-scale to the visible series so tight markets (e.g. 90–98%)
            // fill the plot height instead of hugging the floor. Pad ~8% of the
            // visible span, clamp into [0,1], and guard a flat/degenerate series.
            domain={([dataMin, dataMax]: readonly [number, number]): [number, number] => {
              if (
                !Number.isFinite(dataMin) ||
                !Number.isFinite(dataMax) ||
                dataMax - dataMin < 1e-6
              ) {
                const c = Number.isFinite(dataMin) ? dataMin : 0.5;
                return [Math.max(0, c - 0.05), Math.min(1, c + 0.05)];
              }
              const pad = (dataMax - dataMin) * 0.08;
              return [Math.max(0, dataMin - pad), Math.min(1, dataMax + pad)];
            }}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            stroke="var(--color-border)"
            width={40}
          />
          <Tooltip
            content={<PriceTooltip outcomes={outcomes} locale={i18n.language} />}
            cursor={{ stroke: 'var(--color-border-strong)' }}
          />
          {outcomes.map((o, idx) => {
            const color = pickOutcomeColor(idx);
            return (
              <Line
                key={o.id}
                type="monotone"
                dataKey={o.id}
                name={o.name}
                stroke={color}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
                label={(labelProps: LineEndLabelProps) =>
                  renderLineEndLabel(labelProps, rows.length - 1, o.name, o.price, color, isNarrow)
                }
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
}

interface PriceTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number | string;
  outcomes: OutcomeForChart[];
  locale: string;
}

const PriceTooltip = ({ active, payload, label, outcomes, locale }: PriceTooltipProps) => {
  if (!active || !payload || payload.length === 0) return null;
  const ts = typeof label === 'number' ? label : Number(label);
  return (
    <div
      className="rounded-md px-3 py-2 text-xs"
      style={{
        backgroundColor: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-primary)',
      }}
    >
      <div className="mb-1 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
        {formatTooltipTime(ts, locale)}
      </div>
      {payload.map((entry) => {
        const outcome = outcomes.find((o) => o.id === entry.dataKey);
        const name = outcome?.name ?? String(entry.dataKey);
        const value = typeof entry.value === 'number' ? entry.value : 0;
        return (
          <div key={String(entry.dataKey)} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: 9999,
                backgroundColor: entry.color ?? 'currentColor',
              }}
            />
            <span style={{ color: 'var(--color-text-primary)' }}>{name}</span>
            <span className="ms-auto font-mono" style={{ color: 'var(--color-text-primary)' }}>
              {formatProbability(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
};
