import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useNavigate } from 'react-router-dom';
import { useAgentStats } from '@/features/admin/agent-stats';
import {
  useSystemKpis,
  useSyncHealth,
  TRACKER_STALE_THRESHOLD_SECONDS,
  EVENTS_STALE_THRESHOLD_SECONDS,
  TRENDING_STALE_THRESHOLD_SECONDS,
} from '@/features/stats';
import type { AgentStatsRow } from '@/features/admin/agent-stats';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Spinner } from '@/shared/ui/Spinner';
import { ROUTES, buildPath } from '@/app/router/routes';

const selectStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-elevated)',
  color: 'var(--color-text-primary)',
  borderColor: 'var(--color-border)',
};

// Format a "seconds ago" age into the largest sensible unit (s / min / h / d).
const formatAge = (seconds: number | null, t: TFunction): string => {
  if (seconds === null) return t('agentsDashboard.syncHealthNever');
  if (seconds < 90) return `${seconds} ${t('agentsDashboard.syncUnitSec')}`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} ${t('agentsDashboard.syncUnitMin')}`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} ${t('agentsDashboard.syncUnitHr')}`;
  return `${Math.round(seconds / 86400)} ${t('agentsDashboard.syncUnitDay')}`;
};

// Whole seconds between an ISO timestamp and the server's checked_at reference
// (avoids client clock skew vs. computing against Date.now()).
const secondsAgoFrom = (iso: string | null | undefined, referenceIso: string): number | null => {
  if (!iso) return null;
  const ms = new Date(referenceIso).getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / 1000));
};

// Map a sync_runs.status into a label + dot colour. `running` pulses (live).
const runStatusMeta = (
  status: string | null,
  t: TFunction
): { text: string; color: string; live: boolean } => {
  switch (status) {
    case 'completed':
      return {
        text: t('agentsDashboard.syncRunCompleted'),
        color: 'var(--color-win)',
        live: false,
      };
    case 'completed_with_warnings':
      return {
        text: t('agentsDashboard.syncRunWarnings'),
        color: 'var(--color-pending)',
        live: false,
      };
    case 'running':
      return {
        text: t('agentsDashboard.syncRunRunning'),
        color: 'var(--color-accent)',
        live: true,
      };
    case 'failed':
      return { text: t('agentsDashboard.syncRunFailed'), color: 'var(--color-error)', live: false };
    default:
      return {
        text: t('agentsDashboard.syncRunNever'),
        color: 'var(--color-text-secondary)',
        live: false,
      };
  }
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
  const {
    health: syncHealth,
    staleSeconds: syncStaleSeconds,
    isStale: syncIsStale,
  } = useSyncHealth();

  // One labelled row per sync dimension. Each marks WHAT it describes (label)
  // and its current state (value + dot colour). All come from get_sync_health()
  // in a single call — no extra backend round-trips. Price liveness comes from
  // the market-tracker (books + heartbeat), NOT the edge sync_runs row.
  const syncDimensions = useMemo(() => {
    const SECONDARY = 'var(--color-text-secondary)';
    const WIN = 'var(--color-win)';
    const ERROR = 'var(--color-error)';
    const PENDING = 'var(--color-pending)';
    const unknown = t('agentsDashboard.syncHealthUnknown');

    // Freshness row (events / trending): green when fresh, amber when stale.
    const freshness = (stale: number | null | undefined, threshold: number) =>
      stale === null || stale === undefined
        ? { value: t('agentsDashboard.syncHealthNever'), color: SECONDARY }
        : {
            value: t('agentsDashboard.syncSyncedAgo', { age: formatAge(stale, t) }),
            color: stale > threshold ? PENDING : WIN,
          };

    // 1) Market prices — realtime writer freshness (market_outcome_books). When
    //    fresh, show the genuine price-write count over the last minute (refreshed
    //    each 60s poll — a per-minute figure that never looks frozen). Falls back to
    //    the "last update X ago" text in the rare fresh-but-quiet case (count 0).
    const pricesColor = syncHealth === null ? SECONDARY : syncIsStale ? ERROR : WIN;
    const pricesUpdates = syncHealth?.books_updates_last_minute ?? 0;
    const pricesValue =
      syncHealth === null
        ? unknown
        : syncIsStale
          ? syncStaleSeconds === null
            ? t('agentsDashboard.syncHealthNever')
            : t('agentsDashboard.syncHealthLastUpdate', { age: formatAge(syncStaleSeconds, t) })
          : pricesUpdates > 0
            ? `${t('agentsDashboard.syncHealthLive')} · ${t(
                'agentsDashboard.syncHealthUpdatesPerMin',
                {
                  count: pricesUpdates,
                  n: pricesUpdates.toLocaleString(),
                }
              )}`
            : t('agentsDashboard.syncHealthLastUpdate', { age: formatAge(syncStaleSeconds, t) });

    // 2) Price feed (WS) — CLOB websocket link, via the tracker heartbeat. A
    //    stale/absent heartbeat means the tracker process itself is down.
    let wsValue = unknown;
    let wsColor = SECONDARY;
    let wsLive = false;
    if (syncHealth !== null) {
      const trackerStale = syncHealth.tracker_stale_seconds;
      if (trackerStale === null || trackerStale > TRACKER_STALE_THRESHOLD_SECONDS) {
        wsColor = ERROR;
        wsValue =
          trackerStale === null
            ? t('agentsDashboard.syncWsNoHeartbeat')
            : `${t('agentsDashboard.syncWsNoHeartbeat')} · ${formatAge(trackerStale, t)}`;
      } else if (syncHealth.ws_connected) {
        wsColor = WIN;
        wsLive = true;
        wsValue = t('agentsDashboard.syncWsConnected', {
          tokens: syncHealth.subscribed_tokens ?? 0,
        });
      } else {
        wsColor = ERROR;
        wsValue = t('agentsDashboard.syncWsDisconnected');
      }
    }

    // 3) Events catalog — eventCrawl freshness (events.last_synced_at).
    const events =
      syncHealth === null
        ? { value: unknown, color: SECONDARY }
        : freshness(syncHealth.events_stale_seconds, EVENTS_STALE_THRESHOLD_SECONDS);

    // 4) Trending — last trending-rankings refresh (heartbeat).
    const trending =
      syncHealth === null
        ? { value: unknown, color: SECONDARY }
        : freshness(syncHealth.trending_stale_seconds, TRENDING_STALE_THRESHOLD_SECONDS);

    // 5) Settlements — resolved markets still holding open positions (backlog).
    let settleValue = unknown;
    let settleColor = SECONDARY;
    if (syncHealth !== null) {
      const pending = syncHealth.pending_settlements ?? 0;
      settleColor = pending === 0 ? WIN : PENDING;
      settleValue =
        pending === 0
          ? t('agentsDashboard.syncSettlementsNone')
          : t('agentsDashboard.syncSettlementsPending', { n: pending });
    }

    // 6) Last sync run — edge/manual catalog sync (sync_runs latest row).
    const run = runStatusMeta(syncHealth?.last_run_status ?? null, t);
    const runAgeSec = syncHealth
      ? secondsAgoFrom(
          syncHealth.last_run_finished_at ?? syncHealth.last_run_started_at,
          syncHealth.checked_at
        )
      : null;
    const runValue =
      (syncHealth?.last_run_status ?? null) === null || runAgeSec === null
        ? run.text
        : `${run.text} · ${formatAge(runAgeSec, t)}`;

    return [
      {
        key: 'prices',
        label: t('agentsDashboard.syncDimPrices'),
        value: pricesValue,
        color: pricesColor,
        live: syncHealth !== null && !syncIsStale,
        title: syncHealth?.books_latest_at ?? undefined,
      },
      {
        key: 'ws',
        label: t('agentsDashboard.syncDimWs'),
        value: wsValue,
        color: wsColor,
        live: wsLive,
        title: syncHealth?.tracker_heartbeat_at ?? undefined,
      },
      {
        key: 'events',
        label: t('agentsDashboard.syncDimEvents'),
        value: events.value,
        color: events.color,
        live: false,
        title: syncHealth?.events_latest_at ?? undefined,
      },
      {
        key: 'trending',
        label: t('agentsDashboard.syncDimTrending'),
        value: trending.value,
        color: trending.color,
        live: false,
        title: syncHealth?.last_trending_at ?? undefined,
      },
      {
        key: 'settlements',
        label: t('agentsDashboard.syncDimSettlements'),
        value: settleValue,
        color: settleColor,
        live: false,
        title: undefined,
      },
      {
        key: 'run',
        label: t('agentsDashboard.syncDimRun'),
        value: runValue,
        color: run.color,
        live: run.live,
        title: syncHealth?.last_run_finished_at ?? syncHealth?.last_run_started_at ?? undefined,
      },
    ];
  }, [syncHealth, syncIsStale, syncStaleSeconds, t]);

  const rawMonths = t('globalLog.months', { returnObjects: true });
  const months: string[] = Array.isArray(rawMonths) ? rawMonths : [];

  const filtered = useMemo(() => {
    let rows = agents;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (a) => a.username.toLowerCase().includes(q) || a.full_name.toLowerCase().includes(q)
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
    [sortCol]
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
      {/* Page title + sync-freshness badge */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('agentsDashboard.title')}
        </h1>
        <div
          className="flex w-full flex-col gap-1.5 rounded-xl border px-3 py-2 sm:w-auto sm:min-w-[17rem]"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg-surface)',
          }}
          aria-label={t('agentsDashboard.syncHealthAria')}
        >
          <span
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('agentsDashboard.syncHealthCaption')}
          </span>
          {syncDimensions.map((dim) => (
            <div key={dim.key} className="flex items-center gap-2" title={dim.title}>
              <span className="relative inline-flex h-2 w-2 shrink-0">
                {dim.live && (
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                    style={{ backgroundColor: dim.color }}
                  />
                )}
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ backgroundColor: dim.color }}
                />
              </span>
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {dim.label}
              </span>
              <span
                className="ms-auto text-xs font-medium"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {dim.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t('agentsDashboard.totalPoints')}
          </p>
          <p className="text-xl font-bold font-mono" style={{ color: 'var(--color-text-primary)' }}>
            {kpis.total_points_in_system.toFixed(2)}
          </p>
        </div>
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t('agentsDashboard.openExposure')}
          </p>
          <p className="text-xl font-bold font-mono" style={{ color: 'var(--color-text-primary)' }}>
            {kpis.open_exposure.toFixed(2)}
          </p>
        </div>
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t('agentsDashboard.systemProfit')}
          </p>
          <p
            className="text-xl font-bold font-mono"
            style={{ color: kpis.system_profit >= 0 ? 'var(--color-win)' : 'var(--color-error)' }}
          >
            {kpis.system_profit.toFixed(2)}
          </p>
          <div className="mt-2 space-y-0.5">
            <p className="text-xs font-mono" style={{ color: 'var(--color-win)' }}>
              ↑ {t('agentsDashboard.totalCollected')} {kpis.total_stakes_collected.toFixed(2)}
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
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t('agentsDashboard.systemCounts')}
          </p>
          <p className="text-sm font-mono" style={{ color: 'var(--color-text-primary)' }}>
            U:{kpis.total_users} M:{kpis.total_managers} A:{kpis.active_markets} R:
            {kpis.resolved_markets} AR:{kpis.archived_markets}
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
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t('globalLog.month')}
          </label>
          <select
            value={month ?? ''}
            onChange={(e) => setMonth(e.target.value === '' ? undefined : parseInt(e.target.value))}
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
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t('globalLog.year')}
          </label>
          <select
            value={year ?? ''}
            onChange={(e) => setYear(e.target.value === '' ? undefined : parseInt(e.target.value))}
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
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      ) : filtered.length === 0 ? (
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
          {/* Mobile / tablet-portrait: a card per agent — the wide sortable table
              does not fit below md. */}
          <div className="flex flex-col gap-3 md:hidden">
            {filtered.map((agent) => (
              <div
                key={agent.agent_id}
                className="flex flex-col gap-3 rounded-xl border p-4"
                style={{
                  backgroundColor: 'var(--color-bg-surface)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      onClick={() =>
                        navigate(buildPath(ROUTES.ADMIN.MANAGER_PROFILE, { id: agent.agent_id }))
                      }
                      className="cursor-pointer truncate text-start font-semibold underline-offset-2 hover:underline"
                      style={{
                        color: 'var(--color-accent)',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                      }}
                    >
                      @{agent.username}
                    </button>
                    {agent.full_name && (
                      <div
                        className="truncate text-xs"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {agent.full_name}
                      </div>
                    )}
                  </div>
                  {agent.is_active ? (
                    <Badge variant="open">{t('common.active')}</Badge>
                  ) : (
                    <Badge variant="loss">{t('common.blocked')}</Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('agentsDashboard.monthlyDeposits')}
                    </p>
                    <p className="font-mono text-sm" style={{ color: 'var(--color-win)' }}>
                      {agent.monthly_deposits.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('agentsDashboard.monthlyWithdrawals')}
                    </p>
                    <p className="font-mono text-sm" style={{ color: 'var(--color-error)' }}>
                      {agent.monthly_withdrawals.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('agentsDashboard.currentBalance')}
                    </p>
                    <p className="font-mono text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      {agent.current_system_balance.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('agentsDashboard.monthlyPnl')}
                    </p>
                    <p
                      className="font-mono text-sm"
                      style={{
                        color: agent.monthly_pnl >= 0 ? 'var(--color-win)' : 'var(--color-error)',
                      }}
                    >
                      {agent.monthly_pnl.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: the full sortable table. */}
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
                {filtered.map((agent) => (
                  <tr
                    key={agent.agent_id}
                    className="border-b last:border-0"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    {/* Agent column */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          navigate(buildPath(ROUTES.ADMIN.MANAGER_PROFILE, { id: agent.agent_id }))
                        }
                        className="cursor-pointer text-start underline-offset-2 hover:underline"
                        style={{
                          color: 'var(--color-accent)',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                        }}
                      >
                        @{agent.username}
                      </button>
                      {agent.full_name && (
                        <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          {agent.full_name}
                        </div>
                      )}
                    </td>

                    {/* Monthly Deposits */}
                    <td className="px-4 py-3 font-mono" style={{ color: 'var(--color-win)' }}>
                      {agent.monthly_deposits.toFixed(2)}
                    </td>

                    {/* Monthly Withdrawals */}
                    <td className="px-4 py-3 font-mono" style={{ color: 'var(--color-error)' }}>
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
                        color: agent.monthly_pnl >= 0 ? 'var(--color-win)' : 'var(--color-error)',
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
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default AgentsDashboardPage;
