import { useMemo } from 'react';
import { usePositions, usePositionHistory, useTrades } from '@/features/bet';
import type { UserStats } from '@/shared/types';

/**
 * Aggregate trading stats for the current user, computed from the positions
 * model. Semantics preserved from the legacy bets-based stats (see
 * features/stats/calculations.ts), generalized for the trading model:
 *   - turnover      = total USD bought (sum of buy fills)
 *   - open_exposure = Σ (shares − cost_basis) over open positions (house upside)
 *   - net_pnl       = Σ realized_pnl over all positions (settlement AND sells)
 *   - win_rate      = won / (won + lost) settled positions, as a percentage
 *   - settled_bets  = count of won + lost positions (early-exit 'closed' excluded)
 */
export function useUserStats() {
  const open = usePositions();
  const history = usePositionHistory();
  const trades = useTrades();

  const stats = useMemo<UserStats>(() => {
    const openRows = open.data ?? [];
    const closedRows = history.data ?? [];
    const tradeRows = trades.data ?? [];

    const settled = closedRows.filter((p) => p.status === 'won' || p.status === 'lost');
    const won = settled.filter((p) => p.status === 'won').length;

    return {
      turnover: tradeRows.filter((tr) => tr.side === 'buy').reduce((sum, tr) => sum + tr.usd, 0),
      open_exposure: openRows.reduce((sum, p) => sum + (p.shares - p.cost_basis), 0),
      net_pnl: [...openRows, ...closedRows].reduce((sum, p) => sum + p.realized_pnl, 0),
      win_rate: settled.length > 0 ? (won / settled.length) * 100 : 0,
      settled_bets: settled.length,
    };
  }, [open.data, history.data, trades.data]);

  const isLoading = open.isLoading || history.isLoading || trades.isLoading;
  const error = open.error || history.error || trades.error;

  return {
    stats,
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
