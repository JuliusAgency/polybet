import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAgentStats } from '@/features/admin/agent-stats';
import { useSystemKpis } from '@/features/stats';
import type { AgentStatsRow } from '@/features/admin/agent-stats';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { ROUTES, buildPath } from '@/app/router/routes';

const selectStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-elevated)',
  color: 'var(--color-text-primary)',
  borderColor: 'var(--color-border)',
};

const currentYear = new Date().getFullYear();
const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

const AgentsDashboardPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [month, setMonth] = useState<number | undefined>(undefined);
  const [year, setYear] = useState<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortCol, setSortCol] = useState<keyof AgentStatsRow>('monthly_deposits');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { agents, isLoading } = useAgentStats({ month, year });
  const { kpis } = useSystemKpis();

  const rawMonths = t('globalLog.months', { returnObjects: true });
  const months: string[] = Array.isArray(rawMonths) ? rawMonths : [];

  const filtered = useMemo(() => {
    let rows = agents;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (a) =>
          a.username.toLowerCase().includes(q) || a.full_name.toLowerCase().includes(q),
      );
    }
    return [...rows].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      if (typeof av === 'boolean' && typeof bv === 'boolean') {
        return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
      }
      return 0;
    });
  }, [agents, searchQuery, sortCol, sortDir]);

  const handleSort = useCallback(
    (col: keyof AgentStatsRow) => {
      if (sortCol === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortCol(col);
        setSortDir('desc');
      }
    },
    [sortCol],
  );

  const handleClearFilters = () => {
    setMonth(undefined);
    setYear(undefined);
    setSearchQuery('');
  };

  const sortIndicator = (col: keyof AgentStatsRow) => {
    if (sortCol !== col) return null;
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('agentsDashboard.title')}
        </h1>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t('agentsDashboard.totalPoints')}</p>
          <p className="text-xl font-bold font-mono" style={{ color: 'var(--color-text-primary)' }}>{kpis.total_points_in_system.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t('agentsDashboard.openExposure')}</p>
          <p className="text-xl font-bold font-mono" style={{ color: 'var(--color-text-primary)' }}>{kpis.open_exposure.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t('agentsDashboard.systemProfit')}</p>
          <p className="text-xl font-bold font-mono" style={{ color: kpis.system_profit >= 0 ? 'var(--color-win)' : 'var(--color-error)' }}>
            {kpis.system_profit.toFixed(2)}
          </p>
          <div className="mt-2 space-y-0.5">
            <p className="text-xs font-mono" style={{ color: 'var(--color-win)' }}>
              ↑ {t('agentsDashboard.totalCollected')} {kpis.total_collected_from_losers.toFixed(2)}
            </p>
            <p className="text-xs font-mono" style={{ color: 'var(--color-error)' }}>
              ↓ {t('agentsDashboard.totalPaidOut')} {kpis.total_payouts_to_winners.toFixed(2)}
            </p>
          </div>
        </div>
        <div
          className="group relative rounded-xl border p-4"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
        >
          <span
            className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold"
            style={{
              color: 'var(--color-text-secondary)',
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-elevated)',
            }}
            aria-label={t('agentsDashboard.systemCountsHintAria')}
          >
            ?
          </span>
          <div
            className="pointer-events-none absolute -top-2 right-3 z-10 w-56 -translate-y-full rounded-lg border p-2 text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
            style={{
              color: 'var(--color-text-primary)',
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-elevated)',
            }}
          >
            <div>{t('agentsDashboard.systemCountsHintLineUsers')}</div>
            <div>{t('agentsDashboard.systemCountsHintLineManagers')}</div>
            <div>{t('agentsDashboard.systemCountsHintLineActive')}</div>
            <div>{t('agentsDashboard.systemCountsHintLineResolved')}</div>
            <div>{t('agentsDashboard.systemCountsHintLineArchived')}</div>
          </div>
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t('agentsDashboard.systemCounts')}</p>
          <p className="text-sm font-mono" style={{ color: 'var(--color-text-primary)' }}>
            U:{kpis.total_users} M:{kpis.total_managers} A:{kpis.active_markets} R:{kpis.resolved_markets} AR:{kpis.archived_markets}
          </p>
        </div>
      </div>

      {/* Filters row */}
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
              setMonth(e.target.value === '' ? undefined : parseInt(e.target.value))
            }
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={selectStyle}
          >
            <option value="">{t('globalLog.allMonths')}</option>
            {months.map((name, i) => (
              <option key={i + 1} value={i + 1}>
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
              setYear(e.target.value === '' ? undefined : parseInt(e.target.value))
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

        {/* Search input */}
        <Input
          label={t('agentsDashboard.agentCol')}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('agentsDashboard.searchPlaceholder')}
        />

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
                <th
                  className="cursor-pointer select-none px-4 py-3 font-medium text-start"
                  style={{ color: 'var(--color-text-secondary)' }}
                  onClick={() => handleSort('username')}
                >
                  {t('agentsDashboard.agentCol')}
                  {sortIndicator('username')}
                </th>
                <th
                  className="cursor-pointer select-none px-4 py-3 font-medium text-start"
                  style={{ color: 'var(--color-text-secondary)' }}
                  onClick={() => handleSort('monthly_deposits')}
                >
                  {t('agentsDashboard.monthlyDeposits')}
                  {sortIndicator('monthly_deposits')}
                </th>
                <th
                  className="cursor-pointer select-none px-4 py-3 font-medium text-start"
                  style={{ color: 'var(--color-text-secondary)' }}
                  onClick={() => handleSort('monthly_withdrawals')}
                >
                  {t('agentsDashboard.monthlyWithdrawals')}
                  {sortIndicator('monthly_withdrawals')}
                </th>
                <th
                  className="cursor-pointer select-none px-4 py-3 font-medium text-start"
                  style={{ color: 'var(--color-text-secondary)' }}
                  onClick={() => handleSort('current_system_balance')}
                >
                  {t('agentsDashboard.currentBalance')}
                  {sortIndicator('current_system_balance')}
                </th>
                <th
                  className="cursor-pointer select-none px-4 py-3 font-medium text-start"
                  style={{ color: 'var(--color-text-secondary)' }}
                  onClick={() => handleSort('monthly_pnl')}
                >
                  {t('agentsDashboard.monthlyPnl')}
                  {sortIndicator('monthly_pnl')}
                </th>
                <th
                  className="cursor-pointer select-none px-4 py-3 font-medium text-start"
                  style={{ color: 'var(--color-text-secondary)' }}
                  onClick={() => handleSort('is_active')}
                >
                  {t('agentsDashboard.statusCol')}
                  {sortIndicator('is_active')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                filtered.map((agent) => (
                  <tr
                    key={agent.agent_id}
                    className="border-b last:border-0"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    {/* Agent column */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(buildPath(ROUTES.ADMIN.MANAGER_PROFILE, { id: agent.agent_id }))}
                        className="cursor-pointer text-start underline-offset-2 hover:underline"
                        style={{ color: 'var(--color-accent)', background: 'none', border: 'none', padding: 0 }}
                      >
                        @{agent.username}
                      </button>
                      {agent.full_name && (
                        <div
                          className="text-xs"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {agent.full_name}
                        </div>
                      )}
                    </td>

                    {/* Monthly Deposits */}
                    <td
                      className="px-4 py-3 font-mono"
                      style={{ color: 'var(--color-win)' }}
                    >
                      {agent.monthly_deposits.toFixed(2)}
                    </td>

                    {/* Monthly Withdrawals */}
                    <td
                      className="px-4 py-3 font-mono"
                      style={{ color: 'var(--color-error)' }}
                    >
                      {agent.monthly_withdrawals.toFixed(2)}
                    </td>

                    {/* Current Balance */}
                    <td
                      className="px-4 py-3 font-mono"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {agent.current_system_balance.toFixed(2)}
                    </td>

                    {/* Monthly P&L */}
                    <td
                      className="px-4 py-3 font-mono"
                      style={{
                        color:
                          agent.monthly_pnl >= 0
                            ? 'var(--color-win)'
                            : 'var(--color-error)',
                      }}
                    >
                      {agent.monthly_pnl.toFixed(2)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {agent.is_active ? (
                        <Badge variant="open">{t('common.active')}</Badge>
                      ) : (
                        <Badge variant="loss">{t('common.blocked')}</Badge>
                      )}
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

export default AgentsDashboardPage;
