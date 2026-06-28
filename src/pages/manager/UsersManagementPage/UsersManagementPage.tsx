import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ActionButton, type ActionTone } from '@/shared/ui/ActionButton';
import { Badge } from '@/shared/ui/Badge';
import { TableSkeleton } from '@/shared/ui/TableSkeleton';
import { EditUserModal, type EditUserValues } from '@/shared/ui/EditUserModal';
import { SetPasswordModal } from '@/shared/ui/SetPasswordModal';
import { AdjustBalanceModal } from '@/features/manager/balance';
import {
  useManagerToggleUserBlock,
  useManagerUpdateUser,
  useManagerResetPassword,
  useMyUsers,
  type UserRow,
} from '@/features/manager/users';
import { CreateUserModal } from './components/CreateUserModal';
import {
  PlusIcon,
  PencilIcon,
  KeyIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BanIcon,
  CheckIcon,
} from './components/actionIcons';

interface ModalState {
  userId: string;
  username: string;
  type: 'deposit' | 'withdrawal';
  available?: number;
}

interface EditTarget {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  phone: string;
}

interface ResetTarget {
  userId: string;
  username: string;
}

// One descriptor per row action — single source of truth so the desktop table
// cell and the mobile card render the exact same set without drifting.
interface RowAction {
  key: string;
  label: string;
  tone: ActionTone;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  /** Span both columns in the mobile card's 2-col action grid. */
  span2?: boolean;
}

const UsersManagementPage = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editError, setEditError] = useState('');
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);
  const [resetError, setResetError] = useState('');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const { data, isLoading, error } = useMyUsers();
  const toggleUserBlock = useManagerToggleUserBlock();
  const updateUser = useManagerUpdateUser();
  const resetPassword = useManagerResetPassword();

  const handleEditSubmit = async (values: EditUserValues) => {
    if (!editTarget) return;
    setEditError('');
    try {
      await updateUser.mutateAsync({
        targetUserId: editTarget.userId,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone || null,
      });
      await queryClient.invalidateQueries({ queryKey: ['manager', 'users'] });
      toast.success(t('editUser.updated'));
      setEditTarget(null);
    } catch (mutationError) {
      setEditError(
        mutationError instanceof Error ? mutationError.message : t('common.unknownError')
      );
    }
  };

  const handleResetSubmit = async (newPassword: string) => {
    if (!resetTarget) return;
    setResetError('');
    try {
      await resetPassword.mutateAsync({ targetUserId: resetTarget.userId, newPassword });
      toast.success(t('managerProfile.passwordResetSuccess'));
      setResetTarget(null);
    } catch (mutationError) {
      setResetError(
        mutationError instanceof Error ? mutationError.message : t('common.unknownError')
      );
    }
  };

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

  const rowActions = (row: UserRow): RowAction[] => {
    const isInactive = row.profiles?.is_active === false;
    const username = row.profiles?.username ?? '';
    const fullName = row.profiles?.full_name ?? username;

    return [
      {
        key: 'edit',
        label: t('editUser.edit'),
        tone: 'neutral',
        icon: <PencilIcon />,
        onClick: () =>
          setEditTarget({
            userId: row.user_id,
            username,
            firstName: row.profiles?.first_name ?? '',
            lastName: row.profiles?.last_name ?? '',
            phone: row.profiles?.phone ?? '',
          }),
      },
      {
        key: 'reset',
        label: t('managerProfile.resetPwd'),
        tone: 'neutral',
        icon: <KeyIcon />,
        onClick: () => setResetTarget({ userId: row.user_id, username }),
      },
      {
        key: 'deposit',
        label: t('treasury.deposit'),
        tone: 'success',
        icon: <ArrowDownIcon />,
        disabled: isInactive,
        onClick: () => setModalState({ userId: row.user_id, username, type: 'deposit' }),
      },
      {
        key: 'withdraw',
        label: t('treasury.withdraw'),
        tone: 'warning',
        icon: <ArrowUpIcon />,
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
        label: isInactive ? t('managerProfile.unblock') : t('managerProfile.block'),
        tone: isInactive ? 'success' : 'danger',
        icon: isInactive ? <CheckIcon /> : <BanIcon />,
        disabled: pendingUserId === row.user_id,
        onClick: () => handleToggleBlock(row.user_id, fullName, !isInactive),
        span2: true,
      },
    ];
  };

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('users.title')}
        </h1>
        <ActionButton
          tone="accent"
          size="md"
          icon={<PlusIcon />}
          onClick={() => setIsCreateOpen(true)}
        >
          {t('users.createUser')}
        </ActionButton>
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
          {t('users.noUsers')}
        </p>
      )}

      {data && data.length > 0 && (
        <>
          {/* Mobile / tablet-portrait: a card per user (the wide action table does
              not fit below md). */}
          <div className="flex flex-col gap-3 md:hidden">
            {data.map((row) => (
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
                      @{row.profiles?.username ?? '—'}
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
                    <p className="font-mono text-sm" style={{ color: 'var(--color-text-primary)' }}>
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
                      icon={a.icon}
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
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {rowActions(row).map((a) => (
                          <ActionButton
                            key={a.key}
                            tone={a.tone}
                            icon={a.icon}
                            disabled={a.disabled}
                            onClick={a.onClick}
                          >
                            {a.label}
                          </ActionButton>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <CreateUserModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      <AdjustBalanceModal
        isOpen={modalState !== null}
        onClose={() => setModalState(null)}
        {...(modalState ?? { userId: '', username: '', type: 'deposit' })}
      />
      {editTarget && (
        <EditUserModal
          isOpen
          onClose={() => setEditTarget(null)}
          title={`${t('editUser.title')} - ${editTarget.username}`}
          initialValues={{
            firstName: editTarget.firstName,
            lastName: editTarget.lastName,
            phone: editTarget.phone,
          }}
          isPending={updateUser.isPending}
          errorMsg={editError}
          onSubmit={handleEditSubmit}
        />
      )}
      {resetTarget && (
        <SetPasswordModal
          isOpen
          onClose={() => setResetTarget(null)}
          title={`${t('managerProfile.resetPwd')} - ${resetTarget.username}`}
          isPending={resetPassword.isPending}
          errorMsg={resetError}
          onSubmit={handleResetSubmit}
        />
      )}
    </div>
  );
};

export default UsersManagementPage;
