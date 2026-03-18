import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/shared/api/supabase';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { Modal } from '@/shared/ui/Modal';
import { Input } from '@/shared/ui/Input';
import { useAdjustBalance, useAdjustManagerBalance } from '@/features/admin/adjust-balance';
import { useToggleUserBlock, useResetPassword } from '@/features/admin/manage-user';
import { useManagerUsers, useManagerActionLogs } from '@/features/admin/manager-users';
import type { DbProfile } from '@/shared/types/database';

const ACTION_LOG_QUERY_KEY = ['admin', 'action-logs'];

const fetchManagerBalance = async (managerId: string): Promise<number> => {
  const { data, error } = await supabase
    .from('managers')
    .select('balance')
    .eq('id', managerId)
    .single();
  if (error) throw new Error(error.message);
  return (data as { balance: number }).balance;
};

const FINANCIAL_ACTIONS = new Set(['adjustment', 'transfer']);
const ACCOUNT_ACTIONS = new Set(['block', 'unblock', 'reset_password']);

const fetchManagerProfile = async (managerId: string): Promise<DbProfile | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', managerId)
    .eq('role', 'manager')
    .single();
  if (error) throw new Error(error.message);
  return data as DbProfile;
};

// ── Modal: Deposit / Withdrawal ──────────────────────────────────────────────

interface AdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'deposit' | 'withdrawal';
  targetUser: DbProfile;
  onSuccess: () => void;
}

const AdjustBalanceModal = ({ isOpen, onClose, type, targetUser, onSuccess }: AdjustModalProps) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const adjustBalance = useAdjustBalance();
  const adjustManagerBalance = useAdjustManagerBalance();

  const isManager = targetUser.role === 'manager';
  const isPending = isManager ? adjustManagerBalance.isPending : adjustBalance.isPending;

  const handleSubmit = async () => {
    setErrorMsg('');
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setErrorMsg(t('managerProfile.amountError'));
      return;
    }
    try {
      if (isManager) {
        await adjustManagerBalance.mutateAsync({
          managerId: targetUser.id,
          amount: parsed,
          type,
          note,
        });
      } else {
        await adjustBalance.mutateAsync({
          targetUserId: targetUser.id,
          amount: parsed,
          type,
          note,
        });
      }
      onSuccess();
      setAmount('');
      setNote('');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('common.unknownError'));
    }
  };

  const title = type === 'deposit' ? t('managerProfile.deposit') : t('managerProfile.withdraw');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${title} — ${targetUser.username}`}>
      <div className="flex flex-col gap-4">
        <Input
          label={t('managerProfile.amountLabel')}
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
        <Input
          label={t('managerProfile.noteLabelOpt')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('managerProfile.notePlaceholder')}
        />
        {errorMsg && (
          <p className="text-sm" style={{ color: 'var(--color-loss)' }}>
            {errorMsg}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending ? t('common.processing') : title}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ── Modal: Reset Password ─────────────────────────────────────────────────────

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: DbProfile;
  onSuccess: () => void;
}

const ResetPasswordModal = ({ isOpen, onClose, targetUser, onSuccess }: ResetPasswordModalProps) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const resetPassword = useResetPassword();

  const handleSubmit = async () => {
    setErrorMsg('');
    if (password.length < 6) {
      setErrorMsg(t('managerProfile.passwordError'));
      return;
    }
    try {
      await resetPassword.mutateAsync({
        targetUserId: targetUser.id,
        newPassword: password,
      });
      setPassword('');
      onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('common.unknownError'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${t('managerProfile.resetPwd')} — ${targetUser.username}`}>
      <div className="flex flex-col gap-4">
        <Input
          label={t('managerProfile.newPassword')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('managerProfile.passwordPh')}
        />
        {errorMsg && (
          <p className="text-sm" style={{ color: 'var(--color-loss)' }}>
            {errorMsg}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={resetPassword.isPending}
          >
            {resetPassword.isPending ? t('common.saving') : t('managerProfile.reset')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

type ModalState =
  | { kind: 'deposit'; user: DbProfile }
  | { kind: 'withdrawal'; user: DbProfile }
  | { kind: 'resetPassword'; user: DbProfile }
  | null;

type LogFilter = 'all' | 'financial' | 'account';

export const ManagerProfilePage = () => {
  const { t } = useTranslation();
  const { id: managerId = '' } = useParams<{ id: string }>();
  const usersQueryKey = ['admin', 'manager-users', managerId];
  const managerQueryKey = ['admin', 'manager', managerId];
  const queryClient = useQueryClient();

  const [modal, setModal] = useState<ModalState>(null);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [managerActionPending, setManagerActionPending] = useState(false);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');

  const managerBalanceQueryKey = ['admin', 'manager-balance', managerId];

  const { data: manager, isLoading: managerLoading } = useQuery({
    queryKey: managerQueryKey,
    queryFn: () => fetchManagerProfile(managerId),
    enabled: !!managerId,
  });

  const { data: managerBalance } = useQuery({
    queryKey: managerBalanceQueryKey,
    queryFn: () => fetchManagerBalance(managerId),
    enabled: !!managerId,
  });

  const { data: users, isLoading: usersLoading, error: usersError } = useManagerUsers(managerId);

  const userIds = users ? users.map((u) => u.profile.id) : [];
  const managerAndUserIds = manager ? [manager.id, ...userIds] : userIds;
  const { data: actionLogs } = useManagerActionLogs(managerAndUserIds);

  const filteredLogs = useMemo(() => {
    if (!actionLogs) return [];
    if (logFilter === 'financial') return actionLogs.filter((l) => FINANCIAL_ACTIONS.has(l.action));
    if (logFilter === 'account') return actionLogs.filter((l) => ACCOUNT_ACTIONS.has(l.action));
    return actionLogs;
  }, [actionLogs, logFilter]);

  const invalidateActionLog = () =>
    queryClient.invalidateQueries({ queryKey: ACTION_LOG_QUERY_KEY });

  const toggleBlock = useToggleUserBlock();

  const handleToggleBlock = async (user: DbProfile) => {
    const confirmMsg = user.is_active
      ? t('managerProfile.confirmBlock', { name: user.username })
      : t('managerProfile.confirmUnblock', { name: user.username });
    const confirmed = window.confirm(confirmMsg);
    if (!confirmed) return;

    setPendingUserId(user.id);
    try {
      await toggleBlock.mutateAsync({ targetUserId: user.id });
      queryClient.invalidateQueries({ queryKey: usersQueryKey });
      invalidateActionLog();
      setActionFeedback({
        message: user.is_active
          ? t('managerProfile.userBlockedSuccess')
          : t('managerProfile.userUnblockedSuccess'),
        isError: false,
      });
    } catch (err) {
      setActionFeedback({
        message: err instanceof Error ? err.message : t('common.unknownError'),
        isError: true,
      });
    } finally {
      setPendingUserId(null);
    }
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const handleToggleManagerBlock = async () => {
    if (!manager) return;
    const confirmMsg = manager.is_active
      ? t('managerProfile.confirmBlock', { name: manager.username })
      : t('managerProfile.confirmUnblock', { name: manager.username });
    const confirmed = window.confirm(confirmMsg);
    if (!confirmed) return;

    setManagerActionPending(true);
    try {
      await toggleBlock.mutateAsync({ targetUserId: manager.id });
      queryClient.invalidateQueries({ queryKey: managerQueryKey });
      invalidateActionLog();
      setActionFeedback({
        message: manager.is_active
          ? t('managerProfile.managerBlockedSuccess')
          : t('managerProfile.managerUnblockedSuccess'),
        isError: false,
      });
    } catch (err) {
      setActionFeedback({
        message: err instanceof Error ? err.message : t('common.unknownError'),
        isError: true,
      });
    } finally {
      setManagerActionPending(false);
    }
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const isLoading = managerLoading || usersLoading;

  const logFilterLabels: Record<LogFilter, string> = {
    all: t('common.all'),
    financial: t('managerProfile.financial'),
    account: t('managerProfile.account'),
  };

  return (
    <div
      className="min-h-screen p-6"
      style={{ backgroundColor: 'var(--color-bg-base)' }}
    >
      {/* Header */}
      <div className="mb-6">
        {managerLoading ? (
          <div className="h-8 w-48 rounded" style={{ backgroundColor: 'var(--color-bg-elevated)' }} />
        ) : (
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {t('managerProfile.title', { name: manager?.full_name ?? manager?.username ?? '—' })}
          </h1>
        )}
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('managerProfile.subtitle')}
        </p>
      </div>


      {/* Feedback banner */}
      {actionFeedback && (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: actionFeedback.isError
              ? 'color-mix(in srgb, var(--color-loss) 12%, transparent)'
              : 'color-mix(in srgb, var(--color-win) 12%, transparent)',
            color: actionFeedback.isError ? 'var(--color-loss)' : 'var(--color-win)',
            border: `1px solid ${actionFeedback.isError ? 'var(--color-loss)' : 'var(--color-win)'}`,
          }}
        >
          {actionFeedback.message}
        </div>
      )}

      {isLoading && (
        <p style={{ color: 'var(--color-text-secondary)' }}>{t('common.loading')}</p>
      )}

      {usersError && (
        <p style={{ color: 'var(--color-loss)' }}>
          Error: {usersError instanceof Error ? usersError.message : t('common.unknownError')}
        </p>
      )}

      {users && (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{
            backgroundColor: 'var(--color-bg-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-left"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {[
                  t('managerProfile.username'),
                  t('managerProfile.fullName'),
                  t('managerProfile.available'),
                  t('managerProfile.inPlay'),
                  t('managerProfile.status'),
                  t('managerProfile.actions'),
                ].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-3 font-medium"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {manager && (
                <>
                  <tr style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, transparent)' }}>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                      @{manager.username}{' '}
                      <span
                        className="ms-1 rounded px-1 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--color-accent) 20%, transparent)',
                          color: 'var(--color-accent)',
                        }}
                      >
                        {t('managerProfile.managerActions').split(' ')[0]}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                      {manager.full_name}
                    </td>
                    <td className="px-4 py-3 font-mono" style={{ color: 'var(--color-text-primary)' }}>
                      {managerBalance != null ? managerBalance.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                      —
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={manager.is_active ? 'win' : 'loss'}>
                        {manager.is_active ? t('common.active') : t('common.blocked')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          className="text-xs px-2 py-1"
                          onClick={() => setModal({ kind: 'deposit', user: manager })}
                        >
                          {t('managerProfile.deposit')}
                        </Button>
                        <Button
                          variant="secondary"
                          className="text-xs px-2 py-1"
                          onClick={() => setModal({ kind: 'withdrawal', user: manager })}
                        >
                          {t('managerProfile.withdraw')}
                        </Button>
                        <Button
                          variant={manager.is_active ? 'danger' : 'secondary'}
                          className="text-xs px-2 py-1"
                          onClick={handleToggleManagerBlock}
                          disabled={managerActionPending}
                        >
                          {manager.is_active ? t('managerProfile.block') : t('managerProfile.unblock')}
                        </Button>
                        <Button
                          variant="secondary"
                          className="text-xs px-2 py-1"
                          onClick={() => setModal({ kind: 'resetPassword', user: manager })}
                        >
                          {t('managerProfile.resetPwd')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {users.length > 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        style={{ height: '2px', backgroundColor: 'var(--color-border)', padding: 0 }}
                      />
                    </tr>
                  )}
                </>
              )}
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('managerProfile.noUsers')}
                  </td>
                </tr>
              )}
              {users.map(({ profile, balance }) => (
                <tr
                  key={profile.id}
                  className="border-b last:border-0"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                    @{profile.username}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                    {profile.full_name}
                  </td>
                  <td className="px-4 py-3 font-mono" style={{ color: 'var(--color-text-primary)' }}>
                    {balance.available.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                    {balance.in_play.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={profile.is_active ? 'win' : 'loss'}>
                      {profile.is_active ? t('common.active') : t('common.blocked')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        className="text-xs px-2 py-1"
                        onClick={() => setModal({ kind: 'deposit', user: profile })}
                      >
                        {t('managerProfile.deposit')}
                      </Button>
                      <Button
                        variant="secondary"
                        className="text-xs px-2 py-1"
                        onClick={() => setModal({ kind: 'withdrawal', user: profile })}
                      >
                        {t('managerProfile.withdraw')}
                      </Button>
                      <Button
                        variant={profile.is_active ? 'danger' : 'secondary'}
                        className="text-xs px-2 py-1"
                        onClick={() => handleToggleBlock(profile)}
                        disabled={pendingUserId === profile.id}
                      >
                        {profile.is_active ? t('managerProfile.block') : t('managerProfile.unblock')}
                      </Button>
                      <Button
                        variant="secondary"
                        className="text-xs px-2 py-1"
                        onClick={() => setModal({ kind: 'resetPassword', user: profile })}
                      >
                        {t('managerProfile.resetPwd')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {modal?.kind === 'deposit' && (
        <AdjustBalanceModal
          isOpen
          onClose={() => setModal(null)}
          type="deposit"
          targetUser={modal.user}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: usersQueryKey });
            queryClient.invalidateQueries({ queryKey: managerQueryKey });
            invalidateActionLog();
          }}
        />
      )}
      {modal?.kind === 'withdrawal' && (
        <AdjustBalanceModal
          isOpen
          onClose={() => setModal(null)}
          type="withdrawal"
          targetUser={modal.user}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: usersQueryKey });
            queryClient.invalidateQueries({ queryKey: managerQueryKey });
            invalidateActionLog();
          }}
        />
      )}
      {modal?.kind === 'resetPassword' && (
        <ResetPasswordModal
          isOpen
          onClose={() => setModal(null)}
          targetUser={modal.user}
          onSuccess={invalidateActionLog}
        />
      )}

      {/* Action Log */}
      {actionLogs && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2
              className="text-lg font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {t('managerProfile.actionLog')}
            </h2>
            <div
              className="flex rounded-lg border overflow-hidden text-sm"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {(['all', 'financial', 'account'] as LogFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setLogFilter(f)}
                  className="px-3 py-1.5 capitalize transition-colors"
                  style={{
                    backgroundColor:
                      logFilter === f
                        ? 'var(--color-accent)'
                        : 'var(--color-bg-surface)',
                    color:
                      logFilter === f
                        ? '#fff'
                        : 'var(--color-text-secondary)',
                  }}
                >
                  {logFilterLabels[f]}
                </button>
              ))}
            </div>
          </div>

          <div
            className="overflow-x-auto rounded-xl border"
            style={{
              backgroundColor: 'var(--color-bg-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b text-left"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  {[
                    t('managerProfile.dateCol'),
                    t('managerProfile.actionCol'),
                    t('managerProfile.targetCol'),
                    t('managerProfile.available'),
                    t('managerProfile.noteCol'),
                    t('managerProfile.byCol'),
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-3 font-medium"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {t('managerProfile.noActions')}
                    </td>
                  </tr>
                )}
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b last:border-0"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td
                      className="whitespace-nowrap px-4 py-3 font-mono text-xs"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          log.action === 'adjustment'
                            ? 'win'
                            : log.action === 'transfer'
                              ? 'loss'
                              : 'pending'
                        }
                      >
                        {t(`actionLabels.${log.action}`, { defaultValue: log.action })}
                      </Badge>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                      @{log.target_username}
                    </td>
                    <td
                      className="px-4 py-3 font-mono"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {log.amount != null ? log.amount.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                      {log.note ?? '—'}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                      @{log.initiator_username}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerProfilePage;
