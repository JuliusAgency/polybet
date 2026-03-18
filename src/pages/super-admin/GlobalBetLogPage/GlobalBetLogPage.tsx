import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { useManagers } from '@/features/admin/managers';
import { FinancialTransactionsTable } from '@/widgets/FinancialTransactionsTable';

type Tab = 'bet-log' | 'financial-log';

const selectStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-elevated)',
  color: 'var(--color-text-primary)',
  borderColor: 'var(--color-border)',
};

const GlobalBetLogPage = () => {
  const { t } = useTranslation();
  const months = t('globalLog.months', { returnObjects: true }) as string[];
  const [activeTab, setActiveTab] = useState<Tab>('bet-log');

  // Filters for financial tab
  const [managerId, setManagerId] = useState<string>('');
  const [month, setMonth] = useState<string>('');
  const [year, setYear] = useState<string>('');

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

  return (
    <div
      className="min-h-screen p-6"
      style={{ backgroundColor: 'var(--color-bg-base)' }}
    >
      <h1
        className="mb-6 text-2xl font-bold"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {t('globalLog.title')}
      </h1>

      {/* Tabs */}
      <div
        className="mb-6 flex gap-1 rounded-lg p-1 w-fit"
        style={{ backgroundColor: 'var(--color-bg-surface)' }}
      >
        {([
          { key: 'bet-log', label: t('globalLog.betLog') },
          { key: 'financial-log', label: t('globalLog.financialLog') },
        ] as { key: Tab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor:
                activeTab === tab.key ? 'var(--color-accent)' : 'transparent',
              color:
                activeTab === tab.key
                  ? 'var(--color-text-primary)'
                  : 'var(--color-text-secondary)',
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
        <div style={{ color: 'var(--color-text-secondary)' }}>
          {t('globalLog.comingSoon')}
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
