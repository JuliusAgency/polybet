import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';
import type { MyBet } from './useMyBets';

export function useBetResultNotifications() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const userId = session?.user.id;
  // Tracks bet IDs already settled before this session — no toast for those
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  // Guards inner async callbacks against firing after unmount
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    if (!userId) return;

    // Pre-populate seenIds with bets already settled before mount
    void supabase
      .from('bets')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['won', 'lost'])
      .then(({ data }) => {
        if (!isMounted.current) return;
        (data ?? []).forEach((b) => seenIds.current.add(b.id));
        initialized.current = true;
      });

    const channel = supabase
      .channel(`bet_notifications_${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bets', filter: `user_id=eq.${userId}` },
        (payload) => {
          // Events arriving during the pre-populate window are intentionally dropped
          // to avoid toasting bets that were settled before this session started.
          if (!initialized.current) return;

          const newRow = payload.new as Pick<MyBet, 'id' | 'status' | 'stake' | 'potential_payout'>;

          if (
            (newRow.status !== 'won' && newRow.status !== 'lost') ||
            seenIds.current.has(newRow.id)
          ) {
            return;
          }

          seenIds.current.add(newRow.id);

          // stake and potential_payout are already in the payload — only need
          // the join columns (market question, outcome name) from a second fetch
          const stake = newRow.stake.toFixed(2);
          const payout = newRow.potential_payout.toFixed(2);
          const status = newRow.status;

          void supabase
            .from('bets')
            .select('markets(question), market_outcomes(name)')
            .eq('id', newRow.id)
            .single()
            .then(({ data }) => {
              if (!isMounted.current || !data) return;

              const market = (data.markets as unknown as { question: string } | null)?.question ?? '';
              const outcome = (data.market_outcomes as unknown as { name: string } | null)?.name ?? '';

              if (status === 'won') {
                toast.success(t('bet.notification.won', { market, outcome, stake, payout }), {
                  duration: 8000,
                });
              } else {
                toast.error(t('bet.notification.lost', { market, outcome, stake }), {
                  duration: 8000,
                });
              }
            });
        },
      )
      .subscribe();

    return () => {
      isMounted.current = false;
      void supabase.removeChannel(channel);
      initialized.current = false;
    };
  }, [userId, t]);
}
