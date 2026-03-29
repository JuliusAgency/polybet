import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { AdjustBalanceModal } from '@/features/manager/balance';
import { useManagerToggleUserBlock, useMyUsers } from '@/features/manager/users';
import { CreateUserModal } from './components/CreateUserModal';

interface ModalState {
  userId: string;
  username: string;
  type: 'deposit' | 'withdrawal';
}

const UsersManagementPage = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const { data, isLoading, error } = useMyUsers();
  const toggleUserBlock = useManagerToggleUserBlock();

  const handleToggleBlock = async (userId: string, username: string, isActive: boolean) => {
    const confirmMessage = isActive
      ? t('managerProfile.confirmBlock', { name: username })
      : t('managerProfile.confirmUnblock', { name: username });

    if (!window.confirm(confirmMessage)) return;

    setPendingUserId(userId);

    try {
      await toggleUserBlock.mutateAsync({ targetUserId: userId });
      await queryClient.invalidateQueries({ queryKey: ['manager', 'users'] });
      toast.success(
        isActive
          ? t('managerProfile.userBlockedSuccess')
          : t('managerProfile.userUnblockedSuccess'),
      );
    } catch (mutationError) {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : t('common.unknownError'),
      );
    } finally {
      setPendingUserId(null);
    }
  };

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
                  t('managerProfile.actions'),
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
                    colSpan={6}
                    className="px-4 py-6 text-center"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('users.noUsers')}
                  </td>
                </tr>
              )}
              {data.map((row) => {
                const isInactive = row.profiles?.is_active === false;
                const username = row.profiles?.username ?? '';
                const fullName = row.profiles?.full_name ?? username;

                return (
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
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          className="px-3 py-1 text-xs"
                          disabled={isInactive}
                          onClick={() =>
                            setModalState({ userId: row.user_id, username, type: 'deposit' })
                          }
                        >
                          {t('treasury.deposit')}
                        </Button>
                        <Button
                          variant="secondary"
                          className="px-3 py-1 text-xs"
                          disabled={isInactive}
                          onClick={() =>
                            setModalState({ userId: row.user_id, username, type: 'withdrawal' })
                          }
                        >
                          {t('treasury.withdraw')}
                        </Button>
                        <Button
                          variant={isInactive ? 'secondary' : 'danger'}
                          className="px-3 py-1 text-xs"
                          disabled={pendingUserId === row.user_id}
                          onClick={() =>
                            handleToggleBlock(row.user_id, fullName, !isInactive)
                          }
                        >
                          {isInactive ? t('managerProfile.unblock') : t('managerProfile.block')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateUserModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      <AdjustBalanceModal
        isOpen={modalState !== null}
        onClose={() => setModalState(null)}
        {...(modalState ?? { userId: '', username: '', type: 'deposit' })}
      />
    </div>
  );
};

export default UsersManagementPage;
