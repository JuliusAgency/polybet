import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserBalance } from '@/features/bet';
import { useUserTransactions } from '@/features/wallet';
import { Card } from '@/shared/ui/Card';
import { Input } from '@/shared/ui/Input';

const WalletPage = () => {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: balance, isLoading: balanceLoading } = useUserBalance();
  const { data: transactions, isLoading: txLoading } = useUserTransactions({ startDate, endDate });

  const available = balance?.available ?? 0;
  const inPlay = balance?.in_play ?? 0;
  const totalEquity = available + inPlay;

  // Realtime subscription on balances table to keep balance cards fresh
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user_balance_changes_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'balances',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['user', 'balance', userId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {/* Page title */}
      <h1
        className="mb-6 text-2xl font-bold"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {t('wallet.title')}
      </h1>

      {/* Balance summary cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Available Balance */}
        <Card padding="md">
          <p
            className="mb-1 text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('wallet.available')}
          </p>
          {balanceLoading ? (
            <p className="text-xl font-semibold font-mono" style={{ color: 'var(--color-text-muted)' }}>
              {t('common.loading')}
            </p>
          ) : (
            <p
              className="text-2xl font-bold font-mono"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {available.toFixed(2)}
            </p>
          )}
        </Card>

        {/* In-Play Balance */}
        <Card padding="md">
          <p
            className="mb-1 text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('wallet.inPlay')}
          </p>
          {balanceLoading ? (
            <p className="text-xl font-semibold font-mono" style={{ color: 'var(--color-text-muted)' }}>
              {t('common.loading')}
            </p>
          ) : (
            <p
              className="text-2xl font-bold font-mono"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {inPlay.toFixed(2)}
            </p>
          )}
        </Card>

        {/* Total Equity */}
        <Card padding="md">
          <p
            className="mb-1 text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('wallet.totalEquity')}
          </p>
          {balanceLoading ? (
            <p className="text-xl font-semibold font-mono" style={{ color: 'var(--color-text-muted)' }}>
              {t('common.loading')}
            </p>
          ) : (
            <p
              className="text-2xl font-bold font-mono"
              style={{ color: 'var(--color-accent)' }}
            >
              {totalEquity.toFixed(2)}
            </p>
          )}
        </Card>
      </div>

      {/* Transactions section */}
      <div>
        <h2
          className="mb-4 text-lg font-semibold"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {t('wallet.transactions')}
        </h2>

        {/* Date range filter row */}
        <div className="mb-4 flex flex-wrap gap-3 items-end">
          <Input
            type="date"
            label={t('wallet.from')}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            type="date"
            label={t('wallet.to')}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {/* Transactions table */}
        {txLoading ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('common.loading')}</p>
        ) : !transactions || transactions.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('wallet.noTransactions')}</p>
        ) : (
          <div
            className="overflow-x-auto rounded-xl border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-surface)' }}>
                  <th
                    className="px-4 py-3 font-medium text-start"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('wallet.date')}
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-start"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('wallet.type')}
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-start"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('wallet.amount')}
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-start"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('wallet.runningBalance')}
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-start"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('wallet.note')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isDeposit = tx.type === 'adjustment';
                  const amountColor = isDeposit ? 'var(--color-win)' : 'var(--color-loss)';
                  const amountPrefix = isDeposit ? '+' : '';

                  return (
                    <tr
                      key={tx.id}
                      style={{ borderTop: '1px solid var(--color-border)' }}
                    >
                      <td
                        className="px-4 py-3 font-mono text-xs"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        <div>
                          {new Date(tx.created_at).toLocaleDateString(i18n.language)}
                        </div>
                        <div>
                          {new Date(tx.created_at).toLocaleTimeString(i18n.language, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {tx.type === 'adjustment' ? t('wallet.deposit') : t('wallet.withdrawal')}
                      </td>
                      <td
                        className="px-4 py-3 font-mono font-semibold"
                        style={{ color: amountColor }}
                      >
                        {amountPrefix}{Math.abs(tx.amount).toFixed(2)}
                      </td>
                      <td
                        className="px-4 py-3 font-mono"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {tx.balance_after.toFixed(2)}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {tx.note ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default WalletPage;
