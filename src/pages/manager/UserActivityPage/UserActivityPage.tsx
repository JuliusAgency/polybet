import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useManagerBetLog } from '@/features/manager/bet-log';
import { useMyUsers } from '@/features/manager/users';
import type { BetStatus } from '@/features/admin/bet-log';

const selectStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-elevated)',
  color: 'var(--color-text-primary)',
  borderColor: 'var(--color-border)',
};

const betStatusVariant = (status: BetStatus) => {
  if (status === 'won') return 'win' as const;
  if (status === 'lost') return 'loss' as const;
  if (status === 'open') return 'open' as const;
  return 'default' as const;
};

const UserActivityPage = () => {
  const { id: routeUserId } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();

  const [status, setStatus] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  const { data: users } = useMyUsers();

  const effectiveUserId = routeUserId ?? (selectedUserId || undefined);

  const { rows, isLoading } = useManagerBetLog({
    userId: effectiveUserId,
    status: status ? (status as BetStatus) : undefined,
  });

  const handleClearFilters = () => {
    setStatus('');
    setSelectedUserId('');
  };

  // Find the username for the route-based user header
  const routeUser = routeUserId
    ? users?.find((u) => u.user_id === routeUserId)
    : null;

  const columns = [
    t('globalLog.date'),
    ...(!routeUserId ? [t('globalLog.user')] : []),
    t('myBets.market'),
    t('myBets.selection'),
    t('myBets.wager'),
    t('globalLog.odds'),
    t('globalLog.payout'),
    t('myBets.settled'),
    t('myBets.status'),
  ];

  return (
    <div
      className="min-h-screen p-6"
      style={{ backgroundColor: 'var(--color-bg-base)' }}
    >
      <div className="mb-6">
        <h1
          className="text-2xl font-bold"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {routeUser?.profiles?.username
            ? `@${routeUser.profiles.username}`
            : t('userActivity.title')}
        </h1>
      </div>

      {/* Filters */}
      <div
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-4"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        {/* User dropdown — only shown at /activity, not at /users/:id */}
        {!routeUserId && (
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
              <option value="">{t('userActivity.allUsers')}</option>
              {users?.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  @{u.profiles?.username}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Status filter */}
        <div className="flex flex-col gap-1">
          <label
            className="text-xs font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('globalLog.status')}
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
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
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-6 text-center"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b last:border-0"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    {/* Date */}
                    <td
                      className="px-4 py-3"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {new Date(row.placed_at).toLocaleDateString(i18n.language)}
                    </td>

                    {/* User — only at /activity */}
                    {!routeUserId && (
                      <td
                        className="px-4 py-3"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        @{row.user_username}
                      </td>
                    )}

                    {/* Market */}
                    <td
                      className="px-4 py-3"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {row.market_description.length > 40
                        ? `${row.market_description.slice(0, 40)}…`
                        : row.market_description}
                    </td>

                    {/* Selection */}
                    <td
                      className="px-4 py-3"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
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

                    {/* Settled date */}
                    <td
                      className="px-4 py-3"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {row.settled_at
                        ? new Date(row.settled_at).toLocaleDateString(i18n.language)
                        : '—'}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <Badge variant={betStatusVariant(row.status)}>
                        {t(`bet.${row.status}`)}
                      </Badge>
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

export default UserActivityPage;
