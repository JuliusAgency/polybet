import { useTranslation } from 'react-i18next';
import { TableSkeleton } from '@/shared/ui/TableSkeleton';
import { useManagersReport, type AdminReportFilters } from '@/features/admin/reports';

interface ManagersReportTableProps {
  filters: AdminReportFilters;
}

const formatAmount = (value: number): string => value.toFixed(2);

const formatSigned = (value: number): string =>
  value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);

export const ManagersReportTable = ({ filters }: ManagersReportTableProps) => {
  const { t } = useTranslation();
  const { rows, totals, isLoading, error } = useManagersReport(filters);

  if (isLoading) {
    return <TableSkeleton rows={4} cols={4} />;
  }

  if (error) {
    return (
      <p className="py-6 text-center" style={{ color: 'var(--color-loss)' }}>
        {error.message}
      </p>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="px-6 py-4">
        <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {t('reports.managersReport.tableTitle')}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
            {[
              t('reports.managersReport.manager'),
              t('reports.managersReport.deposits'),
              t('reports.managersReport.withdrawals'),
              t('reports.managersReport.profit'),
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
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={4}
                className="px-4 py-8 text-center"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t('reports.managersReport.empty')}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={row.manager_id}
              className="border-b last:border-0"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                {row.manager_full_name ?? `@${row.manager_username}`}
              </td>
              <td className="px-4 py-3 font-mono" style={{ color: 'var(--color-win)' }}>
                {formatAmount(row.deposits)}
              </td>
              <td className="px-4 py-3 font-mono" style={{ color: 'var(--color-loss)' }}>
                {formatAmount(row.withdrawals)}
              </td>
              <td
                className="px-4 py-3 font-mono"
                style={{ color: row.profit >= 0 ? 'var(--color-win)' : 'var(--color-loss)' }}
              >
                {formatSigned(row.profit)}
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ backgroundColor: 'var(--color-bg-elevated)' }}>
              <td
                className="px-4 py-3 font-semibold"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {t('reports.managersReport.total')}
              </td>
              <td
                className="px-4 py-3 font-mono font-semibold"
                style={{ color: 'var(--color-win)' }}
              >
                {formatAmount(totals.deposits)}
              </td>
              <td
                className="px-4 py-3 font-mono font-semibold"
                style={{ color: 'var(--color-loss)' }}
              >
                {formatAmount(totals.withdrawals)}
              </td>
              <td
                className="px-4 py-3 font-mono font-semibold"
                style={{ color: totals.profit >= 0 ? 'var(--color-win)' : 'var(--color-loss)' }}
              >
                {formatSigned(totals.profit)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};
