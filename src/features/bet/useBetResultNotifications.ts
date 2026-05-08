import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useAuth } from '@/shared/hooks/useAuth';
import type { MyBet } from '@/entities/bet';

export function useBetResultNotifications() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  // Tracks bet IDs already settled before this session — no toast for those
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  // Guards inner async callbacks against firing after unmount
  const isMounted = useRef(true);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    isMounted.current = true;
    // Reset on user change (e.g. sign-out + sign-in without page reload)
    seenIds.current = new Set();
    initialized.current = false;

    if (!userId) return;

    // Pre-populate seenIds with bets already settled before mount, then subscribe.
    // Subscribing inside the .then guarantees no UPDATE events are processed until
    // seenIds is fully populated — otherwise events arriving during the fetch window
    // would be dropped and legitimate "won/lost" toasts would be missed.
    void supabase
      .from('bets')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['won', 'lost'])
      .then(({ data }) => {
        if (!isMounted.current) return;
        (data ?? []).forEach((b) => seenIds.current.add(b.id));
        initialized.current = true;

        channelRef.current = supabase
          .channel(`bet_notifications_${userId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'bets', filter: `user_id=eq.${userId}` },
            (payload) => {
              const newRow = payload.new as Pick<
                MyBet,
                'id' | 'status' | 'stake' | 'potential_payout'
              >;

              if (
                (newRow.status !== 'won' && newRow.status !== 'lost') ||
                seenIds.current.has(newRow.id)
              ) {
                return;
              }

              seenIds.current.add(newRow.id);
              // Also invalidate the unseen count so the badge updates immediately
              void queryClient.invalidateQueries({
                queryKey: ['user', 'unseen-bets-count', userId],
              });

              // stake and potential_payout are already in the payload — only need
              // the join columns (market question, outcome name) from a second fetch
              // Defensive null-coalescing: realtime payloads are untyped at runtime
              const stake = (newRow.stake ?? 0).toFixed(2);
              const payout = (newRow.potential_payout ?? 0).toFixed(2);
              const status = newRow.status;

              void supabase
                .from('bets')
                .select('markets(question), market_outcomes(name)')
                .eq('id', newRow.id)
                .single()
                .then(({ data: betData }) => {
                  if (!isMounted.current || !betData) return;

                  const market =
                    (betData.markets as unknown as { question: string } | null)?.question ?? '';
                  const outcome =
                    (betData.market_outcomes as unknown as { name: string } | null)?.name ?? '';

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
            }
          )
          .subscribe();
      });

    return () => {
      isMounted.current = false;
      initialized.current = false;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, t, queryClient]);
}
