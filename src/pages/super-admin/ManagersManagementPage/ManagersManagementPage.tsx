import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { ROUTES, buildPath } from '@/app/router/routes';
import { useManagers } from '@/features/admin/managers';

export const ManagersManagementPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data, isLoading, error } = useManagers();

  return (
    <div
      className="min-h-screen p-6"
      style={{ backgroundColor: 'var(--color-bg-base)' }}
    >
      <h1
        className="mb-6 text-2xl font-bold"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {t('managers.title')}
      </h1>

      {isLoading && (
        <p style={{ color: 'var(--color-text-secondary)' }}>{t('common.loading')}</p>
      )}

      {error && (
        <p style={{ color: 'var(--color-loss)' }}>
          Error: {error instanceof Error ? error.message : t('common.unknownError')}
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
              <tr
                className="border-b text-start"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {[
                  t('managers.fullName'),
                  t('managers.username'),
                  t('managers.balance'),
                  t('managers.status'),
                  '',
                ].map((h, i) => (
                  <th
                    key={i}
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
                    {t('managers.noManagers')}
                  </td>
                </tr>
              )}
              {data.map(({ profile, manager }) => (
                <tr
                  key={profile.id}
                  className="border-b last:border-0"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                    {profile.full_name}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                    @{profile.username}
                  </td>
                  <td className="px-4 py-3 font-mono" style={{ color: 'var(--color-text-primary)' }}>
                    {manager.balance.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={profile.is_active ? 'win' : 'loss'}>
                      {profile.is_active ? t('common.active') : t('common.blocked')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        navigate(buildPath(ROUTES.ADMIN.MANAGER_PROFILE, { id: profile.id }))
                      }
                    >
                      {t('common.profile')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ManagersManagementPage;
