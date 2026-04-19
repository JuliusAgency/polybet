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
import type { MarketOutcome, PriceHistoryPoint } from '@/features/bet';
import { Spinner } from '@/shared/ui/Spinner';
import { pickOutcomeColor } from './priceHistoryPalette';

interface PriceHistoryChartProps {
  points: PriceHistoryPoint[];
  outcomes: MarketOutcome[];
  isLoading?: boolean;
  height?: number;
}

interface ChartRow {
  ts: number;
  [outcomeId: string]: number;
}

function buildChartRows(points: PriceHistoryPoint[], outcomes: MarketOutcome[]): ChartRow[] {
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
        {t('priceHistory.empty', { defaultValue: 'No price history yet' })}
      </div>
    );
  }

  return (
    <div style={{ height, direction: 'ltr' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
            domain={[0, 1]}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            stroke="var(--color-border)"
            width={40}
          />
          <Tooltip
            content={<PriceTooltip outcomes={outcomes} locale={i18n.language} />}
            cursor={{ stroke: 'var(--color-border-strong)' }}
          />
          {outcomes.map((o, idx) => (
            <Line
              key={o.id}
              type="monotone"
              dataKey={o.id}
              name={o.name}
              stroke={pickOutcomeColor(idx)}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
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
  outcomes: MarketOutcome[];
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
              {Math.round(value * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
};
