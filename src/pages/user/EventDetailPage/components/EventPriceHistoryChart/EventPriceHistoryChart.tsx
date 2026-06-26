import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Market, MarketOutcome } from '@/entities/market';
import { getChartOutcomes } from '@/entities/market';
import type { PriceHistoryPoint, PriceHistoryWindow } from '@/features/bet';
import { useEventPriceHistory } from '@/features/bet';
import {
  PriceHistoryChart,
  PriceHistorySection,
  usePriceHistoryCollapse,
} from '@/shared/ui/PriceHistoryChart';

interface EventPriceHistoryChartProps {
  markets: Market[];
  /** Max number of markets shown by default (sorted by volume desc). */
  defaultTopN?: number;
  /** Max number of market badges visible before the "show more" toggle. */
  collapsedBadgesCount?: number;
}

function marketVolume(m: Market): number {
  return typeof m.volume === 'number' ? m.volume : 0;
}

function marketLabel(m: Market): string {
  return m.group_label ?? m.question;
}

/**
 * Combined price history chart for an event's markets. The user can toggle
 * which markets to include; by default the top N by volume are selected.
 */
export const EventPriceHistoryChart = ({
  markets,
  defaultTopN = 3,
  collapsedBadgesCount = 6,
}: EventPriceHistoryChartProps) => {
  const { t } = useTranslation();
  // Named historyWindow (not `window`) so it never shadows the browser global.
  const [historyWindow, setHistoryWindow] = useState<PriceHistoryWindow>('ALL');
  const [isExpanded, setIsExpanded] = useState(false);
  // Collapsed by default on phones; only the timeframe chips show until the user
  // opens the chart. `open` is always true from md up.
  const { open: isChartOpen, expand, toggle } = usePriceHistoryCollapse();
  const handleWindowChange = (w: PriceHistoryWindow) => {
    setHistoryWindow(w);
    expand();
  };

  const sortedMarkets = useMemo(
    () => [...markets].sort((a, b) => marketVolume(b) - marketVolume(a)),
    [markets]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const ids = sortedMarkets.slice(0, defaultTopN).map((m) => m.id);
    return new Set(ids);
  });

  const marketIds = useMemo(() => sortedMarkets.map((m) => m.id), [sortedMarkets]);
  // Don't fetch price history until the chart is actually shown.
  const { pointsByMarketId, isLoading } = useEventPriceHistory(
    marketIds,
    historyWindow,
    isChartOpen
  );

  const { outcomes, points } = useMemo(() => {
    const outcomesOut: MarketOutcome[] = [];
    const pointsOut: PriceHistoryPoint[] = [];

    sortedMarkets.forEach((market) => {
      if (!selectedIds.has(market.id)) return;
      const prefix = marketLabel(market);
      // Binary sub-markets collapse to their single Yes line (the No line is a
      // redundant 1 − Yes mirror); multi-outcome sub-markets keep every option.
      // A lone line is named by the market label alone ("Argentina") — prefixing
      // "Argentina: Yes" would just be noise.
      const chartOutcomes = getChartOutcomes(market);
      chartOutcomes.forEach((o) => {
        const name = chartOutcomes.length === 1 ? prefix : `${prefix}: ${o.name}`;
        outcomesOut.push({ ...o, name });
      });
      const marketPoints = pointsByMarketId[market.id] ?? [];
      marketPoints.forEach((p) => pointsOut.push(p));
    });

    return { outcomes: outcomesOut, points: pointsOut };
  }, [sortedMarkets, selectedIds, pointsByMarketId]);

  const toggleMarket = (marketId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(marketId)) {
        next.delete(marketId);
      } else {
        next.add(marketId);
      }
      return next;
    });
  };

  return (
    <>
      <PriceHistorySection
        historyWindow={historyWindow}
        onWindowChange={handleWindowChange}
        open={isChartOpen}
        onExpand={expand}
        onToggle={toggle}
      >
        <PriceHistoryChart points={points} outcomes={outcomes} isLoading={isLoading} />
      </PriceHistorySection>

      {/* Market selector badges only make sense once the chart is shown. */}
      {isChartOpen &&
        sortedMarkets.length > 1 &&
        (() => {
          const hasOverflow = sortedMarkets.length > collapsedBadgesCount;
          const visibleMarkets =
            hasOverflow && !isExpanded
              ? sortedMarkets.slice(0, collapsedBadgesCount)
              : sortedMarkets;
          const hiddenCount = sortedMarkets.length - collapsedBadgesCount;

          return (
            <div className="flex flex-wrap gap-2 px-1 pt-2">
              {visibleMarkets.map((m) => {
                const active = selectedIds.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMarket(m.id)}
                    aria-pressed={active}
                    className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: active
                        ? 'color-mix(in oklch, var(--color-accent) 18%, transparent)'
                        : 'var(--color-bg-elevated)',
                      color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      transitionDuration: 'var(--duration-fast)',
                    }}
                  >
                    {marketLabel(m)}
                  </button>
                );
              })}
              {hasOverflow && (
                <button
                  type="button"
                  onClick={() => setIsExpanded((v) => !v)}
                  className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--color-accent)',
                    border: '1px solid var(--color-border)',
                    transitionDuration: 'var(--duration-fast)',
                  }}
                >
                  {isExpanded
                    ? t('eventDetail.showLessMarkets', { defaultValue: 'Show less' })
                    : t('eventDetail.showMoreMarkets', {
                        count: hiddenCount,
                        defaultValue: 'Show {{count}} more',
                      })}
                </button>
              )}
            </div>
          );
        })()}
    </>
  );
};
