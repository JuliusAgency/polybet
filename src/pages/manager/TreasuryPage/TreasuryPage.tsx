import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/shared/ui/Badge';
import { ActionButton, type ActionTone } from '@/shared/ui/ActionButton';
import { TableSkeleton } from '@/shared/ui/TableSkeleton';
import { AdjustBalanceModal } from '@/features/manager/balance';
import { useManagerToggleUserBlock, useMyUsers } from '@/features/manager/users';

interface ModalState {
  userId: string;
  username: string;
  type: 'deposit' | 'withdrawal';
  available?: number;
}

interface RowAction {
  key: string;
  tone: ActionTone;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  /** Stretch across both columns of the mobile action grid (e.g. Block). */
  span2?: boolean;
}

const TreasuryPage = () => {
  const { t } = useTranslation();
  const { data, isLoading, error } = useMyUsers();
  const queryClient = useQueryClient();
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
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
        isActive ? t('managerProfile.userBlockedSuccess') : t('managerProfile.userUnblockedSuccess')
      );
    } catch (mutationError) {
      toast.error(
        mutationError instanceof Error ? mutationError.message : t('common.unknownError')
      );
    } finally {
      setPendingUserId(null);
    }
  };

  // Single source of truth for the per-row actions; both the mobile card grid
  // and the desktop table cell render the same list, laid out differently.
  const rowActions = (row: NonNullable<typeof data>[number]): RowAction[] => {
    const isInactive = row.profiles?.is_active === false;
    const username = row.profiles?.username ?? '';
    const fullName = row.profiles?.full_name ?? username;
    return [
      {
        key: 'deposit',
        tone: 'accent',
        label: t('treasury.deposit'),
        disabled: isInactive,
        onClick: () => setModalState({ userId: row.user_id, username, type: 'deposit' }),
      },
      {
        key: 'withdraw',
        tone: 'neutral',
        label: t('treasury.withdraw'),
        disabled: isInactive,
        onClick: () =>
          setModalState({
            userId: row.user_id,
            username,
            type: 'withdrawal',
            available: row.balances?.available,
          }),
      },
      {
        key: 'block',
        tone: isInactive ? 'neutral' : 'danger',
        label: isInactive ? t('managerProfile.unblock') : t('managerProfile.block'),
        disabled: pendingUserId === row.user_id,
        onClick: () => handleToggleBlock(row.user_id, fullName, !isInactive),
        span2: true,
      },
    ];
  };

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('treasury.title')}
        </h1>
      </div>

      {isLoading && <TableSkeleton rows={5} cols={6} />}
      {error && (
        <p style={{ color: 'var(--color-loss)' }}>
          {error instanceof Error ? error.message : t('common.unknownError')}
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
          {t('treasury.noUsers')}
        </p>
      )}

      {data && data.length > 0 && (
        <>
          {/* Mobile / tablet-portrait: a card per user — the wide action table
              does not fit below md. */}
          <div className="flex flex-col gap-3 md:hidden">
            {data.map((row) => {
              const username = row.profiles?.username ?? '';
              return (
                <div
                  key={row.user_id}
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
                        {row.profiles?.full_name ?? '—'}
                      </p>
                      <p
                        className="truncate text-sm"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        @{username || '—'}
                      </p>
                    </div>
                    <Badge variant={row.profiles?.is_active ? 'win' : 'loss'}>
                      {row.profiles?.is_active ? t('common.active') : t('common.blocked')}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {t('users.available')}
                      </p>
                      <p
                        className="font-mono text-sm"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {row.balances?.available.toFixed(2) ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {t('users.inPlay')}
                      </p>
                      <p
                        className="font-mono text-sm"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {row.balances?.in_play.toFixed(2) ?? '—'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {rowActions(row).map((a) => (
                      <ActionButton
                        key={a.key}
                        tone={a.tone}
                        block
                        disabled={a.disabled}
                        onClick={a.onClick}
                        className={a.span2 ? 'col-span-2' : undefined}
                      >
                        {a.label}
                      </ActionButton>
                    ))}
                  </div>
                </div>
              );
            })}
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
                {data.map((row) => {
                  const username = row.profiles?.username ?? '';
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
                        @{username || '—'}
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
                          {rowActions(row).map((a) => (
                            <ActionButton
                              key={a.key}
                              tone={a.tone}
                              disabled={a.disabled}
                              onClick={a.onClick}
                            >
                              {a.label}
                            </ActionButton>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AdjustBalanceModal
        isOpen={modalState !== null}
        onClose={() => setModalState(null)}
        {...(modalState ?? { userId: '', username: '', type: 'deposit' })}
      />
    </div>
  );
};

export default TreasuryPage;
