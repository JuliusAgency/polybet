import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { TableSkeleton } from '@/shared/ui/TableSkeleton';
import { ROUTES, buildPath } from '@/app/router/routes';
import { useManagers } from '@/features/admin/managers';
import { CreateManagerModal } from './components/CreateManagerModal';

export const ManagersManagementPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data, isLoading, error } = useManagers();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {/* Header row */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('managers.title')}
        </h1>
        <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
          {t('managers.createManager')}
        </Button>
      </div>

      {/* Success banner */}
      {showSuccess && (
        <div
          className="mb-4 flex items-center justify-between rounded-lg px-4 py-3"
          style={{
            backgroundColor: 'var(--color-win-bg, rgba(34,197,94,0.12))',
            border: '1px solid var(--color-win)',
            color: 'var(--color-win)',
          }}
        >
          <span className="text-sm font-medium">{t('managers.createSuccess')}</span>
          <button
            type="button"
            onClick={() => setShowSuccess(false)}
            className="ms-4 text-lg leading-none opacity-70 hover:opacity-100"
            aria-label={t('common.dismiss')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            ×
          </button>
        </div>
      )}

      {isLoading && <TableSkeleton rows={4} cols={5} />}

      {error && (
        <p style={{ color: 'var(--color-loss)' }}>
          Error: {error instanceof Error ? error.message : t('common.unknownError')}
        </p>
      )}

      {data && data.length === 0 && (
        <p
          className="rounded-xl border px-4 py-6 text-center text-sm"
          style={{
            backgroundColor: 'var(--color-bg-surface)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {t('managers.noManagers')}
        </p>
      )}

      {data && data.length > 0 && (
        <>
          {/* Mobile / tablet-portrait: a card per manager — the wide action table
              (with the Profile button) does not fit below md. */}
          <div className="flex flex-col gap-3 md:hidden">
            {data.map(({ profile, manager }) => (
              <div
                key={profile.id}
                className="flex flex-col gap-3 rounded-xl border p-4"
                style={{
                  backgroundColor: 'var(--color-bg-surface)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className="truncate font-semibold"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {profile.full_name}
                    </p>
                    <p
                      className="truncate text-sm"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      @{profile.username}
                    </p>
                  </div>
                  <Badge variant={profile.is_active ? 'win' : 'loss'}>
                    {profile.is_active ? t('common.active') : t('common.blocked')}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('managers.balance')}
                    </p>
                    <p className="font-mono text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      {manager.balance.toFixed(2)}
                    </p>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() =>
                    navigate(buildPath(ROUTES.ADMIN.MANAGER_PROFILE, { id: profile.id }))
                  }
                >
                  {t('common.profile')}
                </Button>
              </div>
            ))}
          </div>

          {/* Desktop: the full table. overflow-x-auto keeps a too-wide table
              scrolling inside its card instead of breaking the page. */}
          <div
            className="hidden overflow-x-auto rounded-xl border md:block"
            style={{
              backgroundColor: 'var(--color-bg-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start" style={{ borderColor: 'var(--color-border)' }}>
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
                    <td
                      className="px-4 py-3 font-mono"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {manager.balance.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={profile.is_active ? 'win' : 'loss'}>
                        {profile.is_active ? t('common.active') : t('common.blocked')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-end">
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
        </>
      )}

      <CreateManagerModal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
        }}
        onSuccess={() => {
          setShowSuccess(true);
          setIsCreateOpen(false);
        }}
      />
    </div>
  );
};

export default ManagersManagementPage;
