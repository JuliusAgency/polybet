import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/shared/api/supabase';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { Modal } from '@/shared/ui/Modal';
import { Input } from '@/shared/ui/Input';
import { Spinner } from '@/shared/ui/Spinner';
import { useAdjustBalance, useAdjustManagerBalance } from '@/features/admin/adjust-balance';
import { useToggleUserBlock, useResetPassword } from '@/features/admin/manage-user';
import { useManagerUsers, useManagerActionLogs } from '@/features/admin/manager-users';
import { useBetLimitSettings } from '@/features/admin/bet-limits';
import { EffectiveLimitBadge } from '@/pages/super-admin/BetLimitsPage/components/EffectiveLimitBadge';
import type { DbProfile } from '@/shared/types/database';
import { formatInitiatorName } from '@/shared/utils';

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

const formatAmount = (value: number | null | undefined) => (value != null ? value.toFixed(2) : '—');

const showTransientFeedback = (
  setFeedback: Dispatch<SetStateAction<{ message: string; isError: boolean } | null>>,
  message: string,
  isError = false
) => {
  setFeedback({ message, isError });
  window.setTimeout(() => setFeedback(null), 3000);
};

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
    <Modal isOpen={isOpen} onClose={onClose} title={`${title} - ${targetUser.username}`}>
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
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            {isPending ? t('common.processing') : title}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: DbProfile;
  onSuccess: () => void;
}

const ResetPasswordModal = ({
  isOpen,
  onClose,
  targetUser,
  onSuccess,
}: ResetPasswordModalProps) => {
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t('managerProfile.resetPwd')} - ${targetUser.username}`}
    >
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
          <Button variant="primary" onClick={handleSubmit} disabled={resetPassword.isPending}>
            {resetPassword.isPending ? t('common.saving') : t('managerProfile.reset')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

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
  const managerBalanceQueryKey = ['admin', 'manager-balance', managerId];
  const queryClient = useQueryClient();

  const [modal, setModal] = useState<ModalState>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [managerActionPending, setManagerActionPending] = useState(false);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');

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
  const { data: betLimitSettings, isLoading: betLimitLoading } = useBetLimitSettings(managerId);

  const managedUsers = users ?? [];
  const userIds = managedUsers.map((user) => user.profile.id);
  const managerAndUserIds = manager ? [manager.id, ...userIds] : userIds;
  const { data: actionLogs } = useManagerActionLogs(managerAndUserIds);

  const effectiveUserLimitById = useMemo(
    () =>
      new Map(
        (betLimitSettings?.effective.users ?? []).map((userLimit) => [userLimit.userId, userLimit])
      ),
    [betLimitSettings?.effective.users]
  );

  const filteredLogs = useMemo(() => {
    if (!actionLogs) return [];
    if (logFilter === 'financial')
      return actionLogs.filter((log) => FINANCIAL_ACTIONS.has(log.action));
    if (logFilter === 'account') return actionLogs.filter((log) => ACCOUNT_ACTIONS.has(log.action));
    return actionLogs;
  }, [actionLogs, logFilter]);

  const invalidateActionLog = () =>
    queryClient.invalidateQueries({ queryKey: ACTION_LOG_QUERY_KEY });

  const invalidateManagerPageData = () => {
    queryClient.invalidateQueries({ queryKey: usersQueryKey });
    queryClient.invalidateQueries({ queryKey: managerQueryKey });
    queryClient.invalidateQueries({ queryKey: managerBalanceQueryKey });
    invalidateActionLog();
  };

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
      showTransientFeedback(
        setActionFeedback,
        user.is_active
          ? t('managerProfile.userBlockedSuccess')
          : t('managerProfile.userUnblockedSuccess')
      );
    } catch (err) {
      showTransientFeedback(
        setActionFeedback,
        err instanceof Error ? err.message : t('common.unknownError'),
        true
      );
    } finally {
      setPendingUserId(null);
    }
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
      showTransientFeedback(
        setActionFeedback,
        manager.is_active
          ? t('managerProfile.managerBlockedSuccess')
          : t('managerProfile.managerUnblockedSuccess')
      );
    } catch (err) {
      showTransientFeedback(
        setActionFeedback,
        err instanceof Error ? err.message : t('common.unknownError'),
        true
      );
    } finally {
      setManagerActionPending(false);
    }
  };

  const isLoading = managerLoading || usersLoading;
  const managerEffectiveLimit = betLimitSettings?.effective.manager?.effectiveMaxBetLimit ?? null;
  const managerLimitSource = betLimitSettings?.effective.manager?.source ?? null;

  const logFilterLabels: Record<LogFilter, string> = {
    all: t('common.all'),
    financial: t('managerProfile.financial'),
    account: t('managerProfile.account'),
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      <div className="mb-6">
        {managerLoading ? (
          <div
            className="h-8 w-48 rounded"
            style={{ backgroundColor: 'var(--color-bg-elevated)' }}
          />
        ) : (
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {t('managerProfile.title', { name: manager?.full_name ?? manager?.username ?? '—' })}
          </h1>
        )}
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('managerProfile.subtitle')}
        </p>
      </div>

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
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      )}

      {usersError && (
        <p style={{ color: 'var(--color-loss)' }}>
          Error: {usersError instanceof Error ? usersError.message : t('common.unknownError')}
        </p>
      )}

      {manager && (
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {t('managerProfile.managerSectionTitle')}
            </h2>
            <Badge variant="pending">{t('managerProfile.managerRoleBadge')}</Badge>
          </div>

          <div
            className="rounded-xl border p-5"
            style={{
              backgroundColor: 'var(--color-bg-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div className="grid gap-4 sm:grid-cols-2">
                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <p
                    className="text-xs font-medium uppercase tracking-[0.14em]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {t('managerProfile.username')}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className="text-base font-semibold"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      @{manager.username}
                    </span>
                    <Badge variant="pending">{t('managerProfile.managerRoleBadge')}</Badge>
                  </div>
                </div>

                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <p
                    className="text-xs font-medium uppercase tracking-[0.14em]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {t('managerProfile.fullName')}
                  </p>
                  <p
                    className="mt-2 text-base font-semibold"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {manager.full_name}
                  </p>
                </div>

                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <p
                    className="text-xs font-medium uppercase tracking-[0.14em]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {t('managerProfile.available')}
                  </p>
                  <p
                    className="mt-2 font-mono text-base font-semibold"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {formatAmount(managerBalance)}
                  </p>
                </div>

                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <p
                    className="text-xs font-medium uppercase tracking-[0.14em]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {t('managerProfile.status')}
                  </p>
                  <div className="mt-2">
                    <Badge variant={manager.is_active ? 'win' : 'loss'}>
                      {manager.is_active ? t('common.active') : t('common.blocked')}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  {betLimitLoading ? (
                    <Spinner size="sm" />
                  ) : (
                    <div className="flex flex-col gap-1">
                      <span
                        className="text-xs font-medium uppercase tracking-[0.14em]"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {t('managerProfile.effectiveBetLimit')}
                      </span>
                      <EffectiveLimitBadge
                        limit={managerEffectiveLimit}
                        source={
                          managerLimitSource === 'manager'
                            ? 'manager'
                            : managerLimitSource === 'global'
                              ? 'global'
                              : null
                        }
                      />
                    </div>
                  )}
                </div>

                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3
                      className="text-sm font-semibold"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {t('managerProfile.managerActions')}
                    </h3>
                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('managerProfile.account')}
                    </span>
                  </div>
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
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {t('managerProfile.managedUsersSectionTitle')}
              </h2>
              <Badge variant="default">{t('managerProfile.userRoleBadge')}</Badge>
            </div>
            <p
              className="mt-1 text-xs"
              title={t('managerProfile.effectiveBetLimitHelp')}
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t('managerProfile.effectiveBetLimitHelp')}
            </p>
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
              <tr className="border-b text-start" style={{ borderColor: 'var(--color-border)' }}>
                {[
                  t('managerProfile.username'),
                  t('managerProfile.fullName'),
                  t('managerProfile.available'),
                  t('managerProfile.inPlay'),
                  t('managerProfile.effectiveBetLimit'),
                  t('managerProfile.status'),
                  t('managerProfile.actions'),
                ].map((heading) => (
                  <th
                    key={heading}
                    className="whitespace-nowrap px-4 py-3 font-medium text-start"
                    style={{ color: 'var(--color-text-secondary)' }}
                    title={
                      heading === t('managerProfile.effectiveBetLimit')
                        ? t('managerProfile.effectiveBetLimitHelp')
                        : undefined
                    }
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {managedUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('managerProfile.noUsers')}
                  </td>
                </tr>
              )}

              {managedUsers.map(({ profile, balance }) => {
                const effectiveLimit = effectiveUserLimitById.get(profile.id);

                return (
                  <tr
                    key={profile.id}
                    className="border-b last:border-0 align-top"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                      <div className="flex flex-col gap-2">
                        <span>@{profile.username}</span>
                        <Badge variant="default">{t('managerProfile.userRoleBadge')}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                      {profile.full_name}
                    </td>
                    <td
                      className="px-4 py-3 font-mono"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {balance.available.toFixed(2)}
                    </td>
                    <td
                      className="px-4 py-3 font-mono"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {balance.in_play.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      {betLimitLoading ? (
                        <Spinner size="sm" />
                      ) : (
                        <EffectiveLimitBadge
                          limit={effectiveLimit?.effectiveMaxBetLimit ?? null}
                          source={
                            effectiveLimit?.source === 'user'
                              ? 'personal'
                              : (effectiveLimit?.source ?? null)
                          }
                        />
                      )}
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
                          {profile.is_active
                            ? t('managerProfile.block')
                            : t('managerProfile.unblock')}
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
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {modal?.kind === 'deposit' && (
        <AdjustBalanceModal
          isOpen
          onClose={() => setModal(null)}
          type="deposit"
          targetUser={modal.user}
          onSuccess={invalidateManagerPageData}
        />
      )}
      {modal?.kind === 'withdrawal' && (
        <AdjustBalanceModal
          isOpen
          onClose={() => setModal(null)}
          type="withdrawal"
          targetUser={modal.user}
          onSuccess={invalidateManagerPageData}
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

      {actionLogs && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {t('managerProfile.actionLog')}
            </h2>
            <div
              className="flex overflow-hidden rounded-lg border text-sm"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {(['all', 'financial', 'account'] as LogFilter[]).map((filterName) => (
                <button
                  key={filterName}
                  onClick={() => setLogFilter(filterName)}
                  className="px-3 py-1.5 capitalize transition-colors"
                  style={{
                    backgroundColor:
                      logFilter === filterName ? 'var(--color-accent)' : 'var(--color-bg-surface)',
                    color: logFilter === filterName ? '#fff' : 'var(--color-text-secondary)',
                  }}
                >
                  {logFilterLabels[filterName]}
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
                <tr className="border-b text-start" style={{ borderColor: 'var(--color-border)' }}>
                  {[
                    t('managerProfile.dateCol'),
                    t('managerProfile.actionCol'),
                    t('managerProfile.targetCol'),
                    t('managerProfile.available'),
                    t('managerProfile.noteCol'),
                    t('managerProfile.byCol'),
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="whitespace-nowrap px-4 py-3 font-medium text-start"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {heading}
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
                      {formatInitiatorName(log.initiator_role, log.initiator_username, t)}
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
