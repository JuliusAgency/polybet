export type BetLikeStatus = 'open' | 'won' | 'lost' | 'cancelled';

export interface BetLikeForStats {
  status: BetLikeStatus;
  stake: number;
  potential_payout: number;
}

export function calculateOpenExposure(bets: BetLikeForStats[]): number {
  return bets.reduce((sum, bet) => {
    if (bet.status !== 'open') return sum;
    return sum + (bet.potential_payout - bet.stake);
  }, 0);
}

export function calculateTurnover(bets: BetLikeForStats[]): number {
  return bets.reduce((sum, bet) => sum + bet.stake, 0);
}

export function calculateRealizedPnl(bets: BetLikeForStats[]): number {
  return bets.reduce((sum, bet) => {
    if (bet.status === 'won') return sum + (bet.stake - bet.potential_payout);
    if (bet.status === 'lost') return sum + bet.stake;
    return sum;
  }, 0);
}

export function calculateWinRate(bets: BetLikeForStats[]): number {
  const settled = bets.filter((bet) => bet.status === 'won' || bet.status === 'lost');
  if (settled.length === 0) return 0;
  const won = settled.filter((bet) => bet.status === 'won').length;
  return (won / settled.length) * 100;
}
