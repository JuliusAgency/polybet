import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePositions, usePositionHistory } from '@/features/bet';
import {
  type Position,
  positionUnrealizedPnl,
  positionUnrealizedPnlPct,
} from '@/entities/position';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { SellSlip } from '@/widgets/SellSlip';
import { formatSharePrice } from '@/shared/utils';

type Tab = 'open' | 'history';

/** Per-share mark for the portfolio list: the live top-of-book mid. Falls back
 *  to the entry price before the first price sync. The exact slippage-adjusted
 *  sell value is shown in the SellSlip. */
function markPrice(p: Position): number {
  return p.market_outcomes?.price ?? p.avg_price;
}

function statusBadgeVariant(status: Position['status']): 'win' | 'loss' | 'open' | 'default' {
  if (status === 'won') return 'win';
  if (status === 'lost') return 'loss';
  if (status === 'open') return 'open';
  return 'default';
}

function statusLabel(t: (k: string) => string, status: Position['status']): string {
  switch (status) {
    case 'won':
      return t('bet.won');
    case 'lost':
      return t('bet.lost');
    case 'closed':
      return t('portfolio.statusClosed');
    default:
      return t('bet.open');
  }
}

const MarketCell = ({ position }: { position: Position }) => {
  const eventId = position.markets?.event_id;
  const question = position.markets?.question ?? '—';
  return eventId ? (
    <Link
      to={`/events/${eventId}`}
      className="hover:underline"
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      {question}
    </Link>
  ) : (
    <span>{question}</span>
  );
};

const MyBetsPage = () => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('open');
  const [selling, setSelling] = useState<Position | null>(null);

  const { data: positions, isLoading: openLoading } = usePositions();
  const { data: history, isLoading: histLoading } = usePositionHistory();

  const open = positions ?? [];
  const closed = history ?? [];

  // Portfolio summary (open positions, marked to the current mid).
  const totalCost = open.reduce((s, p) => s + p.cost_basis, 0);
  const totalValue = open.reduce((s, p) => s + p.shares * markPrice(p), 0);
  const totalUnrealized = totalValue - totalCost;
  const totalRealized = closed.reduce((s, p) => s + p.realized_pnl, 0);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'open', label: t('portfolio.openTab') },
    { key: 'history', label: t('portfolio.historyTab') },
  ];

  const isLoading = activeTab === 'open' ? openLoading : histLoading;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {t('portfolio.title')}
      </h1>

      {/* Portfolio summary band — A2: 2×2 grid on mobile, 4-up on desktop. */}
      <div
        className="mb-6 grid grid-cols-2 gap-4 rounded-xl border p-4 sm:grid-cols-4"
        style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}
      >
        <SummaryStat label={t('portfolio.openValue')} value={`$${totalValue.toFixed(2)}`} />
        <SummaryStat label={t('portfolio.costBasis')} value={`$${totalCost.toFixed(2)}`} />
        <SummaryStat
          label={t('portfolio.unrealizedPnl')}
          value={`${totalUnrealized >= 0 ? '+' : ''}${totalUnrealized.toFixed(2)}`}
          color={totalUnrealized >= 0 ? 'var(--color-win)' : 'var(--color-loss)'}
        />
        <SummaryStat
          label={t('portfolio.realizedPnlTotal')}
          value={`${totalRealized >= 0 ? '+' : ''}${totalRealized.toFixed(2)}`}
          color={totalRealized >= 0 ? 'var(--color-win)' : 'var(--color-loss)'}
        />
      </div>

      {/* Tabs */}
      <div
        className="mb-6 flex w-fit gap-1 rounded-lg p-1"
        style={{ backgroundColor: 'var(--color-bg-surface)' }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: activeTab === tab.key ? 'var(--color-accent)' : 'transparent',
              color:
                activeTab === tab.key ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
              border: 'none',
              outline: 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      )}

      {/* ── OPEN POSITIONS ── */}
      {!isLoading && activeTab === 'open' && (
        <>
          {open.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>{t('portfolio.noOpenPositions')}</p>
          ) : (
            <>
              {/* Desktop table (clips financial columns ≤767px) → mobile card list below. */}
              <div
                className="hidden overflow-x-auto rounded-xl border md:block"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--color-bg-surface)' }}>
                      {[
                        'portfolio.market',
                        'portfolio.selection',
                        'portfolio.shares',
                        'portfolio.avgCost',
                        'portfolio.value',
                        'portfolio.pnl',
                        'portfolio.actions',
                      ].map((k) => (
                        <th
                          key={k}
                          className="px-4 py-3 font-medium text-start"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {t(k)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {open.map((p) => {
                      const mark = markPrice(p);
                      const value = p.shares * mark;
                      const upl = positionUnrealizedPnl(p, mark);
                      const uplPct = positionUnrealizedPnlPct(p, mark);
                      const uplColor = upl >= 0 ? 'var(--color-win)' : 'var(--color-loss)';
                      const sellable = Boolean(p.market_outcomes?.polymarket_token_id);
                      return (
                        <tr key={p.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                          <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                            <MarketCell position={p} />
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                            {p.market_outcomes?.name ?? '—'}
                          </td>
                          <td
                            className="px-4 py-3 num"
                            style={{ color: 'var(--color-text-primary)' }}
                          >
                            {p.shares.toFixed(2)}
                          </td>
                          <td
                            className="px-4 py-3 num"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {formatSharePrice(p.avg_price)}
                          </td>
                          <td
                            className="px-4 py-3 num"
                            style={{ color: 'var(--color-text-primary)' }}
                          >
                            ${value.toFixed(2)}
                            <span
                              className="ms-1 text-xs"
                              style={{ color: 'var(--color-text-muted)' }}
                            >
                              @{formatSharePrice(mark)}
                            </span>
                          </td>
                          <td className="px-4 py-3 num" style={{ color: uplColor }}>
                            {upl >= 0 ? '+' : ''}
                            {upl.toFixed(2)}
                            {uplPct !== null && (
                              <span className="ms-1 text-xs">
                                ({upl >= 0 ? '+' : ''}
                                {(uplPct * 100).toFixed(1)}%)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              variant="secondary"
                              className="text-xs"
                              disabled={!sellable}
                              onClick={() => setSelling(p)}
                            >
                              {t('portfolio.sell')}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile: one card per position so the financial fields never clip. */}
              <div className="flex flex-col gap-3 md:hidden">
                {open.map((p) => (
                  <OpenPositionCard key={p.id} position={p} onSell={() => setSelling(p)} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── HISTORY ── */}
      {!isLoading && activeTab === 'history' && (
        <>
          {closed.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>{t('portfolio.noHistory')}</p>
          ) : (
            <>
              {/* Desktop table (clips financial columns ≤767px) → mobile card list below. */}
              <div
                className="hidden overflow-x-auto rounded-xl border md:block"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--color-bg-surface)' }}>
                      {[
                        'portfolio.market',
                        'portfolio.selection',
                        'portfolio.shares',
                        'portfolio.avgCost',
                        'portfolio.realizedPnlCol',
                        'portfolio.status',
                        'portfolio.settled',
                      ].map((k) => (
                        <th
                          key={k}
                          className="px-4 py-3 font-medium text-start"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {t(k)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {closed.map((p) => {
                      const pnlColor =
                        p.realized_pnl >= 0 ? 'var(--color-win)' : 'var(--color-loss)';
                      return (
                        <tr key={p.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                          <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                            <MarketCell position={p} />
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                            {p.market_outcomes?.name ?? '—'}
                          </td>
                          <td
                            className="px-4 py-3 num"
                            style={{ color: 'var(--color-text-primary)' }}
                          >
                            {p.shares.toFixed(2)}
                          </td>
                          <td
                            className="px-4 py-3 num"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {formatSharePrice(p.avg_price)}
                          </td>
                          <td className="px-4 py-3 num" style={{ color: pnlColor }}>
                            {p.realized_pnl >= 0 ? '+' : ''}
                            {p.realized_pnl.toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={statusBadgeVariant(p.status)}>
                              {statusLabel(t, p.status)}
                            </Badge>
                          </td>
                          <td
                            className="px-4 py-3 num text-xs"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {p.settled_at
                              ? new Date(p.settled_at).toLocaleDateString(i18n.language)
                              : new Date(p.updated_at).toLocaleDateString(i18n.language)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile: one card per closed position. */}
              <div className="flex flex-col gap-3 md:hidden">
                {closed.map((p) => (
                  <HistoryPositionCard key={p.id} position={p} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {selling && <SellSlip position={selling} onClose={() => setSelling(null)} />}
    </div>
  );
};

const SummaryStat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
      {label}
    </span>
    <span
      className="num text-lg font-semibold"
      style={{ color: color ?? 'var(--color-text-primary)' }}
    >
      {value}
    </span>
  </div>
);

/** One label/value pair inside a mobile position card. Numeric (sans +
 *  tabular-nums via `.num`) by default to match the desktop table's numeric
 *  columns; pass mono={false} for text/badges. */
const Field = ({
  label,
  children,
  color,
  mono = true,
}: {
  label: string;
  children: ReactNode;
  color?: string;
  mono?: boolean;
}) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
      {label}
    </span>
    <span className={mono ? 'num' : ''} style={{ color: color ?? 'var(--color-text-primary)' }}>
      {children}
    </span>
  </div>
);

/** Mobile (≤767px) card for an open position — same fields as the desktop table
 *  row, stacked so nothing clips at 390px. */
const OpenPositionCard = ({ position: p, onSell }: { position: Position; onSell: () => void }) => {
  const { t } = useTranslation();
  const mark = markPrice(p);
  const value = p.shares * mark;
  const upl = positionUnrealizedPnl(p, mark);
  const uplPct = positionUnrealizedPnlPct(p, mark);
  const uplColor = upl >= 0 ? 'var(--color-win)' : 'var(--color-loss)';
  const sellable = Boolean(p.market_outcomes?.polymarket_token_id);
  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}
    >
      <div
        className="mb-3 line-clamp-2 text-sm font-medium"
        style={{ color: 'var(--color-text-primary)' }}
      >
        <MarketCell position={p} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Field label={t('portfolio.selection')} mono={false}>
          {p.market_outcomes?.name ?? '—'}
        </Field>
        <Field label={t('portfolio.shares')}>{p.shares.toFixed(2)}</Field>
        <Field label={t('portfolio.avgCost')} color="var(--color-text-secondary)">
          {formatSharePrice(p.avg_price)}
        </Field>
        <Field label={t('portfolio.value')}>
          ${value.toFixed(2)}
          <span className="ms-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            @{formatSharePrice(mark)}
          </span>
        </Field>
        <Field label={t('portfolio.pnl')} color={uplColor}>
          {upl >= 0 ? '+' : ''}
          {upl.toFixed(2)}
          {uplPct !== null && (
            <span className="ms-1 text-xs">
              ({upl >= 0 ? '+' : ''}
              {(uplPct * 100).toFixed(1)}%)
            </span>
          )}
        </Field>
      </div>
      <Button
        variant="secondary"
        className="mt-3 w-full text-xs"
        disabled={!sellable}
        onClick={onSell}
      >
        {t('portfolio.sell')}
      </Button>
    </div>
  );
};

/** Mobile (≤767px) card for a closed/settled position. */
const HistoryPositionCard = ({ position: p }: { position: Position }) => {
  const { t, i18n } = useTranslation();
  const pnlColor = p.realized_pnl >= 0 ? 'var(--color-win)' : 'var(--color-loss)';
  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}
    >
      <div
        className="mb-3 line-clamp-2 text-sm font-medium"
        style={{ color: 'var(--color-text-primary)' }}
      >
        <MarketCell position={p} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Field label={t('portfolio.selection')} mono={false}>
          {p.market_outcomes?.name ?? '—'}
        </Field>
        <Field label={t('portfolio.shares')}>{p.shares.toFixed(2)}</Field>
        <Field label={t('portfolio.avgCost')} color="var(--color-text-secondary)">
          {formatSharePrice(p.avg_price)}
        </Field>
        <Field label={t('portfolio.realizedPnlCol')} color={pnlColor}>
          {p.realized_pnl >= 0 ? '+' : ''}
          {p.realized_pnl.toFixed(2)}
        </Field>
        <Field label={t('portfolio.status')} mono={false}>
          <Badge variant={statusBadgeVariant(p.status)}>{statusLabel(t, p.status)}</Badge>
        </Field>
        <Field label={t('portfolio.settled')}>
          {p.settled_at
            ? new Date(p.settled_at).toLocaleDateString(i18n.language)
            : new Date(p.updated_at).toLocaleDateString(i18n.language)}
        </Field>
      </div>
    </div>
  );
};

export default MyBetsPage;
