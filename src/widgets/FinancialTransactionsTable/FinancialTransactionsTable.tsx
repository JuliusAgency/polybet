import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import { useFinancialTransactions } from '@/features/admin/financial-transactions';
import type { TransactionFilters } from '@/features/admin/financial-transactions';
import { formatInitiatorName } from '@/shared/utils';

interface FinancialTransactionsTableProps {
  managerId?: string;
  month?: number;
  year?: number;
}

const formatDate = (iso: string, locale: string): { date: string; time: string } => {
  const d = new Date(iso);
  const resolvedLocale = locale === 'he' ? 'he-IL' : 'en-GB';
  return {
    date: d.toLocaleDateString(resolvedLocale, { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString(resolvedLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
};

const formatAmount = (amount: number, type: 'adjustment' | 'transfer'): string => {
  if (type === 'adjustment') return `+${amount.toFixed(2)}`;
  return `-${Math.abs(amount).toFixed(2)}`;
};

const formatRunningTotal = (value: number): string => {
  if (value >= 0) return `+${value.toFixed(2)}`;
  return value.toFixed(2); // negative sign already included
};

export const FinancialTransactionsTable = ({
  managerId,
  month,
  year,
}: FinancialTransactionsTableProps) => {
  const { t, i18n } = useTranslation();
  const filters: TransactionFilters = { managerId, month, year };
  const { transactions, totals, isLoading, error } = useFinancialTransactions(filters);

  if (isLoading) {
    return (
      <p style={{ color: 'var(--color-text-secondary)' }} className="py-6 text-center">
        Loading…
      </p>
    );
  }

  if (error) {
    return (
      <p style={{ color: 'var(--color-loss)' }} className="py-6 text-center">
        Error: {error.message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="overflow-hidden rounded-xl border"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              className="border-b text-start"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {[
                t('financialTable.actionId'),
                t('financialTable.manager'),
                t('financialTable.userTarget'),
                t('financialTable.type'),
                t('financialTable.amount'),
                t('financialTable.totalProfitCalc'),
                t('financialTable.date'),
              ].map((h) => (
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
            {transactions.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t('financialTable.noTransactions')}
                </td>
              </tr>
            )}
            {transactions.map((tx) => (
              <tr
                key={tx.id}
                className="border-b last:border-0"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <td
                  className="px-4 py-3 font-mono text-xs"
                  style={{ color: 'var(--color-text-secondary)' }}
                  title={tx.id}
                >
                  {tx.id.slice(0, 8)}
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                  {formatInitiatorName(tx.initiator_role, tx.manager_username, t)}
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                  {tx.user_username}
                </td>
                <td className="px-4 py-3">
                  {tx.type === 'adjustment' ? (
                    <Badge variant="win">{t('financialTable.deposit')}</Badge>
                  ) : (
                    <Badge variant="loss">{t('financialTable.withdrawal')}</Badge>
                  )}
                </td>
                <td
                  className="px-4 py-3 font-mono"
                  style={{
                    color: tx.type === 'adjustment'
                      ? 'var(--color-win)'
                      : 'var(--color-loss)',
                  }}
                >
                  {formatAmount(tx.amount, tx.type)}
                </td>
                <td
                  className="px-4 py-3 font-mono"
                  style={{
                    color: tx.total_profit_calc >= 0
                      ? 'var(--color-win)'
                      : 'var(--color-loss)',
                  }}
                >
                  {formatRunningTotal(tx.total_profit_calc)}
                </td>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  <div>{formatDate(tx.created_at, i18n.language).date}</div>
                  <div>{formatDate(tx.created_at, i18n.language).time}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals summary */}
      <div
        className="flex flex-wrap gap-6 rounded-xl border px-6 py-4"
        style={{
          backgroundColor: 'var(--color-bg-elevated)',
          borderColor: 'var(--color-border)',
        }}
      >
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {t('financialTable.totalDeposits')}:{' '}
          <span className="font-mono font-semibold" style={{ color: 'var(--color-win)' }}>
            +{totals.totalDeposits.toFixed(2)}
          </span>
        </span>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {t('financialTable.totalWithdrawals')}:{' '}
          <span className="font-mono font-semibold" style={{ color: 'var(--color-loss)' }}>
            -{totals.totalWithdrawals.toFixed(2)}
          </span>
        </span>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {t('financialTable.netProfit')}:{' '}
          <span
            className="font-mono font-semibold"
            style={{
              color: totals.netProfit >= 0 ? 'var(--color-win)' : 'var(--color-loss)',
            }}
          >
            {totals.netProfit >= 0 ? '+' : ''}
            {totals.netProfit.toFixed(2)}
          </span>
        </span>
      </div>
    </div>
  );
};
