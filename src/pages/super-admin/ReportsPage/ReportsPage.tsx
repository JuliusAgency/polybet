import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useExportAdminReport, type AdminReportType } from '@/features/admin/reports';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';

type PeriodPreset = 'thisWeek' | 'thisMonth' | 'thisQuarter' | 'thisYear' | 'custom';

const selectStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-elevated)',
  color:           'var(--color-text-primary)',
  borderColor:     'var(--color-border)',
};

function getPeriodDates(preset: PeriodPreset): { started_at: string; ended_at: string } {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  const toIso = (d: Date) => d.toISOString();

  switch (preset) {
    case 'thisWeek': {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { started_at: toIso(start), ended_at: toIso(end) };
    }
    case 'thisMonth': {
      return {
        started_at: toIso(new Date(year, month, 1)),
        ended_at:   toIso(new Date(year, month + 1, 0, 23, 59, 59, 999)),
      };
    }
    case 'thisQuarter': {
      const qStart = Math.floor(month / 3) * 3;
      return {
        started_at: toIso(new Date(year, qStart, 1)),
        ended_at:   toIso(new Date(year, qStart + 3, 0, 23, 59, 59, 999)),
      };
    }
    case 'thisYear': {
      return {
        started_at: toIso(new Date(year, 0, 1)),
        ended_at:   toIso(new Date(year, 11, 31, 23, 59, 59, 999)),
      };
    }
    default:
      return { started_at: '', ended_at: '' };
  }
}

const REPORTS: { type: AdminReportType; titleKey: string; descKey: string }[] = [
  { type: 'managers_log',     titleKey: 'reports.types.managers_log',     descKey: 'reports.descriptions.managers_log'     },
  { type: 'bets_log',         titleKey: 'reports.types.bets_log',         descKey: 'reports.descriptions.bets_log'         },
  { type: 'system_dashboard', titleKey: 'reports.types.system_dashboard', descKey: 'reports.descriptions.system_dashboard' },
];

const PERIOD_PRESETS: PeriodPreset[] = ['thisWeek', 'thisMonth', 'thisQuarter', 'thisYear', 'custom'];

const AdminReportsPage = () => {
  const { t, i18n } = useTranslation();
  const [preset, setPreset]           = useState<PeriodPreset>('thisMonth');
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const exportReport = useExportAdminReport();

  const getFilters = () => {
    if (preset === 'custom') {
      return {
        started_at: customStart ? new Date(customStart).toISOString() : undefined,
        ended_at:   customEnd   ? new Date(customEnd).toISOString()   : undefined,
      };
    }
    return getPeriodDates(preset);
  };

  const handleExport = (reportType: AdminReportType) => {
    exportReport.mutate({ report_type: reportType, filters: getFilters(), locale: i18n.language });
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('reports.title')}
        </h1>
      </div>

      {/* Period selector */}
      <div
        className="mb-6 rounded-xl border p-4"
        style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex flex-wrap gap-2">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: preset === p ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                color:           'var(--color-text-primary)',
                border:          '1px solid var(--color-border)',
                cursor:          'pointer',
              }}
            >
              {t(`reports.periods.${p}`)}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t('reports.startDate')}
              </label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={selectStyle}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t('reports.endDate')}
              </label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={selectStyle}
              />
            </div>
          </div>
        )}
      </div>

      {/* Report cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {REPORTS.map(({ type, titleKey, descKey }) => {
          const isThisCard  = exportReport.isPending && exportReport.variables?.report_type === type;
          const isThisError = exportReport.isError   && exportReport.variables?.report_type === type;

          return (
            <Card key={type}>
              <p className="mb-1 text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {t(titleKey)}
              </p>
              <p className="mb-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {t(descKey)}
              </p>
              {isThisError && (
                <p className="mb-2 text-xs" style={{ color: 'var(--color-error)' }}>
                  {(exportReport.error as Error)?.message ?? t('common.unknownError')}
                </p>
              )}
              <Button
                variant="primary"
                onClick={() => handleExport(type)}
                disabled={isThisCard}
              >
                {isThisCard ? t('common.processing') : t('reports.exportPdf')}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AdminReportsPage;
