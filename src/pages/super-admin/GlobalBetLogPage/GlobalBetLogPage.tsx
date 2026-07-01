import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { ExternalLink } from '@/shared/ui/ExternalLink';
import { TableSkeleton } from '@/shared/ui/TableSkeleton';
import { useManagers } from '@/features/admin/managers';
import { useBetLog } from '@/features/admin/bet-log';
import type { BetStatus } from '@/features/admin/bet-log';
import { FinancialTransactionsTable } from '@/widgets/FinancialTransactionsTable';
import { formatSharePrice, polymarketMarketUrl } from '@/shared/utils';

type Tab = 'bet-log' | 'financial-log';

const selectStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-elevated)',
  color: 'var(--color-text-primary)',
  borderColor: 'var(--color-border)',
};

const GlobalBetLogPage = () => {
  const { t, i18n } = useTranslation();
  const months = t('globalLog.months', { returnObjects: true }) as string[];
  const [activeTab, setActiveTab] = useState<Tab>('bet-log');

  // Filters for financial tab
  const [managerId, setManagerId] = useState<string>('');
  const [month, setMonth] = useState<string>('');
  const [year, setYear] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Filters for bet-log tab
  const [betManagerId, setBetManagerId] = useState<string>('');
  const [betStatus, setBetStatus] = useState<string>('');

  const { data: managers } = useManagers();

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  const handleClearFilters = () => {
    setManagerId('');
    setMonth('');
    setYear('');
    setFromDate('');
    setToDate('');
  };

  const isRangeReversed = Boolean(fromDate && toDate && fromDate > toDate);

  const filterProps = {
    managerId: managerId || undefined,
    month: month ? Number(month) : undefined,
    year: year ? Number(year) : undefined,
    from: !isRangeReversed && fromDate ? fromDate : undefined,
    to: !isRangeReversed && toDate ? toDate : undefined,
  };

  const { rows: betRows, isLoading: betLoading } = useBetLog({
    managerId: betManagerId || undefined,
    status: betStatus ? (betStatus as BetStatus) : undefined,
  });

  const handleClearBetFilters = () => {
    setBetManagerId('');
    setBetStatus('');
  };

  // Column headers for the bet-log table
  const betLogColumns = [
    t('globalLog.user'),
    t('globalLog.manager'),
    t('myBets.market'),
    t('globalLog.selection'),
    t('globalLog.side'),
    t('myBets.wager'),
    t('globalLog.price'),
    t('globalLog.shares'),
    t('globalLog.status'),
    t('globalLog.date'),
  ];

  // Map bet status to Badge variant
  const betStatusVariant = (status: BetStatus) => {
    if (status === 'won') return 'win' as const;
    if (status === 'lost') return 'loss' as const;
    if (status === 'open') return 'open' as const;
    return 'default' as const;
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('globalLog.title')}
        </h1>
      </div>

      {/* Tabs */}
      <div
        className="mb-6 flex gap-1 rounded-lg p-1 w-fit"
        style={{ backgroundColor: 'var(--color-bg-surface)' }}
      >
        {(
          [
            { key: 'bet-log', label: t('globalLog.betLog') },
            { key: 'financial-log', label: t('globalLog.financialLog') },
          ] as { key: Tab; label: string }[]
        ).map((tab) => (
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

      {/* Tab content */}
      {activeTab === 'bet-log' && (
        <div className="flex flex-col gap-4">
          {/* Filters */}
          <div
            className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
            style={{
              backgroundColor: 'var(--color-bg-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            {/* Manager dropdown */}
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t('globalLog.manager')}
              </label>
              <select
                value={betManagerId}
                onChange={(e) => setBetManagerId(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={selectStyle}
              >
                <option value="">{t('globalLog.allManagers')}</option>
                {managers?.map(({ profile }) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name} (@{profile.username})
                  </option>
                ))}
              </select>
            </div>

            {/* Status dropdown */}
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t('globalLog.status')}
              </label>
              <select
                value={betStatus}
                onChange={(e) => setBetStatus(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={selectStyle}
              >
                <option value="">{t('globalLog.allStatuses')}</option>
                <option value="open">{t('bet.open')}</option>
                <option value="won">{t('bet.won')}</option>
                <option value="lost">{t('bet.lost')}</option>
                <option value="cancelled">{t('bet.cancelled')}</option>
              </select>
            </div>

            {/* Clear filters */}
            <Button variant="secondary" onClick={handleClearBetFilters}>
              {t('globalLog.clearFilters')}
            </Button>
          </div>

          {/* Table */}
          {betLoading ? (
            <TableSkeleton rows={6} cols={9} />
          ) : betRows.length === 0 ? (
            <p
              className="rounded-xl border px-4 py-6 text-center text-sm"
              style={{
                backgroundColor: 'var(--color-bg-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {t('common.noData')}
            </p>
          ) : (
            <>
              {/* Mobile / tablet-portrait: a card per bet — the wide record table
                  does not fit below md. */}
              <div className="flex flex-col gap-3 md:hidden">
                {betRows.map((row) => {
                  const marketLabel =
                    row.market_description.length > 40
                      ? `${row.market_description.slice(0, 40)}…`
                      : row.market_description;
                  return (
                    <div
                      key={row.id}
                      className="flex flex-col gap-3 rounded-xl border p-4"
                      style={{
                        backgroundColor: 'var(--color-bg-surface)',
                        borderColor: 'var(--color-border)',
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className="truncate font-semibold"
                            style={{ color: 'var(--color-text-primary)' }}
                          >
                            {row.polymarket_event_slug ? (
                              <ExternalLink
                                href={polymarketMarketUrl(
                                  row.polymarket_event_slug,
                                  row.polymarket_slug
                                )}
                                aria-label={`${t('globalLog.openInPolymarket')}: ${row.market_description}`}
                              >
                                {marketLabel}
                              </ExternalLink>
                            ) : (
                              marketLabel
                            )}
                          </p>
                          <p
                            className="truncate text-sm"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {row.outcome_name}
                          </p>
                          <p
                            className="truncate text-xs"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            @{row.user_username}
                            {' · '}
                            {row.manager_username ? `@${row.manager_username}` : '—'}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-end gap-1">
                          <Badge variant={row.side === 'buy' ? 'win' : 'loss'}>
                            {t(row.side === 'buy' ? 'markets.buyTab' : 'markets.sellTab')}
                          </Badge>
                          <Badge variant={betStatusVariant(row.status)}>
                            {t(`bet.${row.status}`)}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                            {t('myBets.wager')}
                          </p>
                          <p
                            className="font-mono text-sm"
                            style={{ color: 'var(--color-text-primary)' }}
                          >
                            {row.stake.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                            {t('globalLog.price')}
                          </p>
                          <p
                            className="font-mono text-sm"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {formatSharePrice(row.avg_price)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                            {t('globalLog.shares')}
                          </p>
                          <p
                            className="font-mono text-sm"
                            style={{ color: 'var(--color-text-primary)' }}
                          >
                            {row.shares.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                            {t('globalLog.date')}
                          </p>
                          <p
                            className="font-mono text-xs"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {new Date(row.placed_at).toLocaleDateString(i18n.language)}{' '}
                            {new Date(row.placed_at).toLocaleTimeString(i18n.language, {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: the full record table. */}
              <div
                className="hidden overflow-x-auto rounded-xl border md:block"
                style={{
                  backgroundColor: 'var(--color-bg-surface)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                      {betLogColumns.map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 font-medium text-start"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {betRows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b last:border-0"
                        style={{ borderColor: 'var(--color-border)' }}
                      >
                        {/* User */}
                        <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                          @{row.user_username}
                        </td>
                        {/* Manager */}
                        <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                          {row.manager_username ? `@${row.manager_username}` : '—'}
                        </td>
                        {/* Market */}
                        <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                          {(() => {
                            const label =
                              row.market_description.length > 40
                                ? `${row.market_description.slice(0, 40)}…`
                                : row.market_description;
                            return row.polymarket_event_slug ? (
                              <ExternalLink
                                href={polymarketMarketUrl(
                                  row.polymarket_event_slug,
                                  row.polymarket_slug
                                )}
                                aria-label={`${t('globalLog.openInPolymarket')}: ${row.market_description}`}
                              >
                                {label}
                              </ExternalLink>
                            ) : (
                              label
                            );
                          })()}
                        </td>
                        {/* Selection */}
                        <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                          {row.outcome_name}
                        </td>
                        {/* Side (buy / sell) */}
                        <td className="px-4 py-3">
                          <Badge variant={row.side === 'buy' ? 'win' : 'loss'}>
                            {t(row.side === 'buy' ? 'markets.buyTab' : 'markets.sellTab')}
                          </Badge>
                        </td>
                        {/* Wager */}
                        <td
                          className="px-4 py-3 font-mono"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {row.stake.toFixed(2)}
                        </td>
                        {/* Price (avg fill price, cents) */}
                        <td
                          className="px-4 py-3 font-mono"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {formatSharePrice(row.avg_price)}
                        </td>
                        {/* Shares to win (each pays $1) */}
                        <td
                          className="px-4 py-3 font-mono"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {row.shares.toFixed(2)}
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          <Badge variant={betStatusVariant(row.status)}>
                            {t(`bet.${row.status}`)}
                          </Badge>
                        </td>
                        {/* Date */}
                        <td
                          className="px-4 py-3 font-mono text-xs"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          <div>{new Date(row.placed_at).toLocaleDateString(i18n.language)}</div>
                          <div>
                            {new Date(row.placed_at).toLocaleTimeString(i18n.language, {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'financial-log' && (
        <div className="flex flex-col gap-4">
          {/* Filters */}
          <div
            className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
            style={{
              backgroundColor: 'var(--color-bg-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            {/* Manager dropdown */}
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t('globalLog.manager')}
              </label>
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={selectStyle}
              >
                <option value="">{t('globalLog.allManagers')}</option>
                {managers?.map(({ profile }) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name} (@{profile.username})
                  </option>
                ))}
              </select>
            </div>

            {/* Month dropdown */}
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t('globalLog.month')}
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={selectStyle}
              >
                <option value="">{t('globalLog.allMonths')}</option>
                {months.map((label, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Year dropdown */}
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t('globalLog.year')}
              </label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={selectStyle}
              >
                <option value="">{t('globalLog.allYears')}</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* From date */}
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t('globalLog.from')}
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={selectStyle}
              />
            </div>

            {/* To date */}
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t('globalLog.to')}
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={selectStyle}
              />
            </div>

            {/* Clear filters */}
            <Button variant="secondary" onClick={handleClearFilters}>
              {t('globalLog.clearFilters')}
            </Button>

            {isRangeReversed && (
              <p className="w-full text-xs" style={{ color: 'var(--color-loss)' }}>
                {t('globalLog.rangeReversed')}
              </p>
            )}
          </div>

          {/* Table */}
          <FinancialTransactionsTable
            managerId={filterProps.managerId}
            month={filterProps.month}
            year={filterProps.year}
            from={filterProps.from}
            to={filterProps.to}
          />
        </div>
      )}
    </div>
  );
};

export default GlobalBetLogPage;
