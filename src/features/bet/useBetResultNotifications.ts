import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';

// Toasts when one of the user's positions settles at resolution, and keeps the
// portfolio/balance caches fresh in real time.
//
// In the positions model settlement writes a `bet_payout` row into the
// (realtime-published, user-filtered) balance_transactions ledger — one per
// settled position. We subscribe to INSERTs there: an INSERT only fires for
// rows created AFTER subscription, so unlike the old bets-UPDATE approach there
// is no "already settled before mount" race and no seen-id bookkeeping needed.
// won  → bet_payout amount > 0 (shares paid out); lost → amount == 0.
//
// positions is intentionally NOT in the realtime publication (high-write, see
// CLAUDE.md), so this ledger signal is also how the Portfolio learns of a
// settlement live — we invalidate the positions queries on each payout.
export function useBetResultNotifications() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const isMounted = useRef(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    isMounted.current = true;
    if (!userId) return;

    channelRef.current = supabase
      .channel(`settlement_notifications_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'balance_transactions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            type?: string;
            amount?: number | string | null;
            position_id?: string | null;
          };
          if (row.type !== 'bet_payout' || !row.position_id) return;

          const payoutAmount = Number(row.amount ?? 0);
          const won = payoutAmount > 0;

          // Refresh the portfolio + balance now that this position settled.
          void queryClient.invalidateQueries({ queryKey: ['user', 'positions', userId] });
          void queryClient.invalidateQueries({ queryKey: ['user', 'position-history', userId] });
          void queryClient.invalidateQueries({ queryKey: ['user', 'balance'] });

          // Fetch market/outcome context for the toast text.
          void supabase
            .from('positions')
            .select('shares, avg_price, markets(question), market_outcomes(name)')
            .eq('id', row.position_id)
            .single()
            .then(({ data }) => {
              if (!isMounted.current || !data) return;
              const market =
                (data.markets as unknown as { question: string } | null)?.question ?? '';
              const outcome =
                (data.market_outcomes as unknown as { name: string } | null)?.name ?? '';
              const shares = Number((data as { shares?: number }).shares ?? 0);
              const avgPrice = Number((data as { avg_price?: number }).avg_price ?? 0);
              const stake = (shares * avgPrice).toFixed(2);
              const payout = payoutAmount.toFixed(2);

              if (won) {
                toast.success(t('bet.notification.won', { market, outcome, stake, payout }), {
                  duration: 8000,
                });
              } else {
                toast.error(t('bet.notification.lost', { market, outcome, stake }), {
                  duration: 8000,
                });
              }
            });
        }
      )
      .subscribe();

    return () => {
      isMounted.current = false;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, t, queryClient]);
}
