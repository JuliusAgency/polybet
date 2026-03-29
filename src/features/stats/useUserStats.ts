import { useMemo } from 'react';
import { useMyBets } from '@/features/bet';
import type { UserStats } from '@/shared/types';
import {
  calculateOpenExposure,
  calculateRealizedPnl,
  calculateTurnover,
  calculateWinRate,
} from './calculations';

export function useUserStats() {
  const { data: bets, isLoading, error } = useMyBets();

  const stats = useMemo<UserStats>(() => {
    const rows = bets ?? [];
    const settledCount = rows.filter((bet) => bet.status === 'won' || bet.status === 'lost').length;

    return {
      turnover: calculateTurnover(rows),
      open_exposure: calculateOpenExposure(rows),
      net_pnl: calculateRealizedPnl(rows),
      win_rate: calculateWinRate(rows),
      settled_bets: settledCount,
    };
  }, [bets]);

  return {
    stats,
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
