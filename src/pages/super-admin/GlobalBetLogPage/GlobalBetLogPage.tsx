import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { TableSkeleton } from '@/shared/ui/TableSkeleton';
import { useManagers } from '@/features/admin/managers';
import { useBetLog } from '@/features/admin/bet-log';
import type { BetStatus } from '@/features/admin/bet-log';
import { FinancialTransactionsTable } from '@/widgets/FinancialTransactionsTable';
import type { DbSyncRun } from '@/shared/types/database';
import { SyncMarketsModal } from './components/SyncMarketsModal';

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
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [lastSyncRun, setLastSyncRun] = useState<DbSyncRun | null>(null);

  // Filters for financial tab
  const [managerId, setManagerId] = useState<string>('');
  const [month, setMonth] = useState<string>('');
  const [year, setYear] = useState<string>('');

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
  };

  const filterProps = {
    managerId: managerId || undefined,
    month: month ? Number(month) : undefined,
    year: year ? Number(year) : undefined,
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
    t('myBets.wager'),
    t('globalLog.odds'),
    t('globalLog.payout'),
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('globalLog.title')}
        </h1>
        <div className="flex items-center gap-3">
          {lastSyncRun && (
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('settlement.syncDone', {
                synced: lastSyncRun.markets_synced,
                settled: lastSyncRun.markets_settled,
              })}
            </span>
          )}
          <Button variant="primary" onClick={() => setIsSyncModalOpen(true)}>
            {t('settlement.syncMarkets')}
          </Button>
        </div>
      </div>

      <SyncMarketsModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onCompleted={(run) => {
          if (run.status === 'completed' || run.status === 'completed_with_warnings') {
            setLastSyncRun(run);
          }
        }}
      />

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
          ) : (
            <div
              className="overflow-hidden rounded-xl border"
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
                  {betRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-6 text-center"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {t('common.noData')}
                      </td>
                    </tr>
                  ) : (
                    betRows.map((row) => (
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
                          {row.market_description.length > 40
                            ? `${row.market_description.slice(0, 40)}…`
                            : row.market_description}
                        </td>
                        {/* Selection */}
                        <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                          {row.outcome_name}
                        </td>
                        {/* Wager */}
                        <td
                          className="px-4 py-3 font-mono"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {row.stake.toFixed(2)}
                        </td>
                        {/* Odds */}
                        <td
                          className="px-4 py-3 font-mono"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {row.locked_odds.toFixed(2)}
                        </td>
                        {/* Payout */}
                        <td
                          className="px-4 py-3 font-mono"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {row.potential_payout.toFixed(2)}
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
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

            {/* Clear filters */}
            <Button variant="secondary" onClick={handleClearFilters}>
              {t('globalLog.clearFilters')}
            </Button>
          </div>

          {/* Table */}
          <FinancialTransactionsTable
            managerId={filterProps.managerId}
            month={filterProps.month}
            year={filterProps.year}
          />
        </div>
      )}
    </div>
  );
};

export default GlobalBetLogPage;
