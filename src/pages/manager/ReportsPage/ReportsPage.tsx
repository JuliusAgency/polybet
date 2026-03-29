import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFinancialTransactions } from '@/features/admin/financial-transactions';
import { useMyUsers } from '@/features/manager/users';
import { useManagerGroupStats } from '@/features/stats';
import { useAuth } from '@/shared/hooks/useAuth';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';

const selectStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-elevated)',
  color: 'var(--color-text-primary)',
  borderColor: 'var(--color-border)',
};

const currentYear = new Date().getFullYear();
const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

const ReportsPage = () => {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();

  const [month, setMonth] = useState<number | undefined>(undefined);
  const [year, setYear] = useState<number | undefined>(undefined);
  const [selectedUserId, setSelectedUserId] = useState('');

  const { data: users } = useMyUsers();
  const { stats: groupStats } = useManagerGroupStats();

  const { transactions, isLoading } = useFinancialTransactions({
    managerId: session?.user.id,
    month,
    year,
  });

  const filteredTransactions = selectedUserId
    ? transactions.filter((tx) => tx.user_id === selectedUserId)
    : transactions;

  const filteredTotals = {
    totalDeposits: filteredTransactions.reduce(
      (sum, tx) => (tx.type === 'adjustment' ? sum + tx.amount : sum),
      0,
    ),
    totalWithdrawals: filteredTransactions.reduce(
      (sum, tx) => (tx.type === 'transfer' ? sum + Math.abs(tx.amount) : sum),
      0,
    ),
    netProfit: 0,
  };
  filteredTotals.netProfit = filteredTotals.totalDeposits - filteredTotals.totalWithdrawals;

  const handleClearFilters = () => {
    setMonth(undefined);
    setYear(undefined);
    setSelectedUserId('');
  };

  const rawMonths = t('globalLog.months', { returnObjects: true });
  const months: string[] = Array.isArray(rawMonths) ? rawMonths : [];

  const columns = [
    t('financialTable.date'),
    t('globalLog.user'),
    t('financialTable.type'),
    t('financialTable.amount'),
    t('wallet.runningBalance'),
    t('managerProfile.noteCol'),
  ];

  return (
    <div
      className="min-h-screen p-6"
      style={{ backgroundColor: 'var(--color-bg-base)' }}
    >
      {/* Page title */}
      <div className="mb-6">
        <h1
          className="text-2xl font-bold"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {t('reports.title')}
        </h1>
      </div>

      {/* Net Profit Calculator row */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p
            className="mb-1 text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('financialTable.totalDeposits')}
          </p>
          <p
            className="text-xl font-bold font-mono"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {filteredTotals.totalDeposits.toFixed(2)}
          </p>
        </Card>

        <Card>
          <p
            className="mb-1 text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('financialTable.totalWithdrawals')}
          </p>
          <p
            className="text-xl font-bold font-mono"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {filteredTotals.totalWithdrawals.toFixed(2)}
          </p>
        </Card>

        <Card>
          <p
            className="mb-1 text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('financialTable.netProfit')}
          </p>
          <p
            className="text-xl font-bold font-mono"
            style={{
              color:
                filteredTotals.netProfit >= 0
                  ? 'var(--color-win)'
                  : 'var(--color-error)',
            }}
          >
            {filteredTotals.netProfit.toFixed(2)}
          </p>
        </Card>
      </div>

      {/* Group betting metrics */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p
            className="mb-1 text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('reports.groupOpenExposure')}
          </p>
          <p className="text-xl font-bold font-mono" style={{ color: 'var(--color-text-primary)' }}>
            {groupStats.group_open_exposure.toFixed(2)}
          </p>
        </Card>

        <Card>
          <p
            className="mb-1 text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('reports.groupTurnover')}
          </p>
          <p className="text-xl font-bold font-mono" style={{ color: 'var(--color-text-primary)' }}>
            {groupStats.group_turnover.toFixed(2)}
          </p>
        </Card>

        <Card>
          <p
            className="mb-1 text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('reports.groupPnl')}
          </p>
          <p
            className="text-xl font-bold font-mono"
            style={{ color: groupStats.group_pnl >= 0 ? 'var(--color-win)' : 'var(--color-error)' }}
          >
            {groupStats.group_pnl.toFixed(2)}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <div
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-4"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        {/* Month dropdown */}
        <div className="flex flex-col gap-1">
          <label
            className="text-xs font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('globalLog.month')}
          </label>
          <select
            value={month ?? ''}
            onChange={(e) =>
              setMonth(e.target.value === '' ? undefined : Number(e.target.value))
            }
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={selectStyle}
          >
            <option value="">{t('globalLog.allMonths')}</option>
            {months.map((name, idx) => (
              <option key={idx + 1} value={idx + 1}>
                {name}
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
            value={year ?? ''}
            onChange={(e) =>
              setYear(e.target.value === '' ? undefined : Number(e.target.value))
            }
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

        {/* User dropdown */}
        <div className="flex flex-col gap-1">
          <label
            className="text-xs font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('globalLog.user')}
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={selectStyle}
          >
            <option value="">{t('reports.allUsers')}</option>
            {users?.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                @{u.profiles?.username}
              </option>
            ))}
          </select>
        </div>

        <Button variant="secondary" onClick={handleClearFilters}>
          {t('globalLog.clearFilters')}
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>{t('common.loading')}</p>
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
                {columns.map((h) => (
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
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-6 text-center"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('financialTable.noTransactions')}
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b last:border-0"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    {/* Date */}
                    <td
                      className="px-4 py-3 font-mono text-xs"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      <div>
                        {new Date(tx.created_at).toLocaleDateString(i18n.language)}
                      </div>
                      <div>
                        {new Date(tx.created_at).toLocaleTimeString(i18n.language, {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </div>
                    </td>

                    {/* User */}
                    <td
                      className="px-4 py-3"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      @{tx.user_username}
                    </td>

                    {/* Type */}
                    <td
                      className="px-4 py-3"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {tx.type === 'adjustment'
                        ? t('financialTable.deposit')
                        : t('financialTable.withdrawal')}
                    </td>

                    {/* Amount */}
                    <td
                      className="px-4 py-3 font-mono"
                      style={{
                        color:
                          tx.type === 'adjustment'
                            ? 'var(--color-win)'
                            : 'var(--color-error)',
                      }}
                    >
                      {tx.amount.toFixed(2)}
                    </td>

                    {/* Balance After */}
                    <td
                      className="px-4 py-3 font-mono"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {tx.balance_after.toFixed(2)}
                    </td>

                    {/* Note */}
                    <td
                      className="px-4 py-3"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {tx.note ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
