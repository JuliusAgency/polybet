import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAllLimitsData,
  useSetGlobalBetLimit,
  useSetManagerBetLimit,
  useSetUserBetLimit,
} from '@/features/admin/bet-limits';
import type { ManagerLimitNode } from '@/features/admin/bet-limits';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { LimitEditor } from './components/LimitEditor';
import { EffectiveLimitBadge } from './components/EffectiveLimitBadge';

type ManagerLimitNodeWithMatch = ManagerLimitNode & { _hasUserMatch: boolean };

export const BetLimitsPage = () => {
  const { t } = useTranslation();
  const { data, isLoading, error } = useAllLimitsData();
  const setGlobal = useSetGlobalBetLimit();
  const setManager = useSetManagerBetLimit();
  const setUser = useSetUserBetLimit();

  const [search, setSearch] = useState('');
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(new Set());

  const toggle = (managerId: string) => {
    setManuallyExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(managerId)) next.delete(managerId);
      else next.add(managerId);
      return next;
    });
  };

  const q = search.trim().toLowerCase();

  const filteredManagers = useMemo((): ManagerLimitNodeWithMatch[] => {
    if (!data) return [];
    if (!q) return data.managers.map((m) => ({ ...m, _hasUserMatch: false }));
    return data.managers
      .map((m) => {
        const managerMatches =
          m.username.toLowerCase().includes(q) || (m.fullName ?? '').toLowerCase().includes(q);
        const matchedUsers = m.users.filter(
          (u) =>
            u.username.toLowerCase().includes(q) ||
            (u.fullName ?? '').toLowerCase().includes(q),
        );
        if (managerMatches || matchedUsers.length > 0) {
          return {
            ...m,
            users: managerMatches ? m.users : matchedUsers,
            _hasUserMatch: matchedUsers.length > 0,
          };
        }
        return null;
      })
      .filter((m): m is ManagerLimitNodeWithMatch => m !== null);
  }, [data, q]);

  const isExpanded = (managerId: string, hasUserMatch: boolean): boolean => {
    if (q && hasUserMatch) return true;
    return manuallyExpanded.has(managerId);
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('betLimits.title')}
        </h1>
      </div>

      {/* Global limit card */}
      <div
        className="mb-6 rounded-xl border p-5"
        style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}
      >
        <p className="mb-3 text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {t('betLimits.globalLimitCard')}
        </p>
        {data ? (
          <LimitEditor
            value={data.globalLimit}
            onSave={(v) => setGlobal.mutateAsync({ maxBetLimit: v })}
            isSaving={setGlobal.isPending}
          />
        ) : (
          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
        )}
      </div>

      {/* Search */}
      <div
        className="mb-4 flex items-end gap-3 rounded-xl border p-4"
        style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('betLimits.searchPlaceholder')}
          />
        </div>
        {search && (
          <Button variant="secondary" onClick={() => setSearch('')}>
            {t('betLimits.clearSearch')}
          </Button>
        )}
      </div>

      {/* Loading / error */}
      {isLoading && (
        <p style={{ color: 'var(--color-text-secondary)' }}>{t('common.loading')}</p>
      )}
      {error && (
        <p style={{ color: 'var(--color-loss)' }}>
          {error instanceof Error ? error.message : t('common.unknownError')}
        </p>
      )}

      {/* Managers table */}
      {data && !isLoading && (
        <div
          className="overflow-hidden rounded-xl border"
          style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                <th
                  className="px-4 py-3 font-medium text-start"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t('betLimits.managerCol')}
                </th>
                <th
                  className="px-4 py-3 font-medium text-start"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t('betLimits.managerLimit')}
                </th>
                <th
                  className="px-4 py-3 font-medium text-start"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t('betLimits.effectiveLimit')}
                </th>
                <th
                  className="px-4 py-3 font-medium text-start"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t('betLimits.usersCount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredManagers.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('betLimits.noManagers')}
                  </td>
                </tr>
              )}
              {filteredManagers.map((manager) => {
                const open = isExpanded(manager.managerId, manager._hasUserMatch);
                return (
                  <>
                    {/* Manager row */}
                    <tr
                      key={manager.managerId}
                      className="cursor-pointer border-b transition-colors"
                      style={{ borderColor: 'var(--color-border)' }}
                      onClick={() => toggle(manager.managerId)}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                          'var(--color-hover)')
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLTableRowElement).style.backgroundColor = '')
                      }
                    >
                      <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                        <span className="me-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {open ? '▼' : '▶'}
                        </span>
                        <span className="font-medium">@{manager.username}</span>
                        {manager.fullName && (
                          <span className="ms-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                            {manager.fullName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <LimitEditor
                          value={manager.ownLimit}
                          onSave={(v) =>
                            setManager.mutateAsync({ managerId: manager.managerId, maxBetLimit: v })
                          }
                          isSaving={setManager.isPending}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <EffectiveLimitBadge
                          limit={manager.effectiveLimit}
                          source={manager.effectiveSource}
                        />
                      </td>
                      <td
                        className="px-4 py-3 font-mono text-xs"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {manager.users.length}
                      </td>
                    </tr>

                    {/* User rows */}
                    {open &&
                      manager.users.map((user) => (
                        <tr
                          key={user.userId}
                          className="border-b last:border-0"
                          style={{
                            borderColor: 'var(--color-border)',
                            backgroundColor: 'var(--color-bg-base)',
                          }}
                        >
                          <td
                            className="py-2 pe-4 ps-10"
                            style={{ color: 'var(--color-text-primary)' }}
                          >
                            <span style={{ color: 'var(--color-text-muted)' }}>└ </span>
                            @{user.username}
                            {user.fullName && (
                              <span
                                className="ms-2 text-xs"
                                style={{ color: 'var(--color-text-secondary)' }}
                              >
                                {user.fullName}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                            <LimitEditor
                              value={user.ownLimit}
                              onSave={(v) =>
                                setUser.mutateAsync({ userId: user.userId, maxBetLimit: v })
                              }
                              isSaving={setUser.isPending}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <EffectiveLimitBadge
                              limit={user.effectiveLimit}
                              source={user.effectiveSource}
                            />
                          </td>
                          <td className="px-4 py-2" />
                        </tr>
                      ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default BetLimitsPage;
