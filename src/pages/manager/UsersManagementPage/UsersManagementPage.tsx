import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useMyUsers } from '@/features/manager/users';
import { CreateUserModal } from './components/CreateUserModal';

const UsersManagementPage = () => {
  const { t } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error } = useMyUsers();

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('users.title')}
        </h1>
        <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
          {t('users.createUser')}
        </Button>
      </div>

      {isLoading && (
        <p style={{ color: 'var(--color-text-secondary)' }}>{t('common.loading')}</p>
      )}
      {error && (
        <p style={{ color: 'var(--color-loss)' }}>
          {error instanceof Error ? error.message : t('common.unknownError')}
        </p>
      )}

      {data && (
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
                {[
                  t('managers.fullName'),
                  t('managers.username'),
                  t('users.available'),
                  t('users.inPlay'),
                  t('managers.status'),
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
              {data.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('users.noUsers')}
                  </td>
                </tr>
              )}
              {data.map((row) => (
                <tr
                  key={row.user_id}
                  className="border-b last:border-0"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                    {row.profiles?.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                    @{row.profiles?.username ?? '—'}
                  </td>
                  <td
                    className="px-4 py-3 font-mono"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {row.balances?.available.toFixed(2) ?? '—'}
                  </td>
                  <td
                    className="px-4 py-3 font-mono"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {row.balances?.in_play.toFixed(2) ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={row.profiles?.is_active ? 'win' : 'loss'}>
                      {row.profiles?.is_active ? t('common.active') : t('common.blocked')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateUserModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
};

export default UsersManagementPage;
