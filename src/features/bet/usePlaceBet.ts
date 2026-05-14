import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface PlaceBetInput {
  marketId: string;
  outcomeId: string;
  stake: number;
  expectedOdds: number;
}

/**
 * Thrown when the backend rejects a bet because effective_odds drifted beyond
 * the drift-tolerance window since the user opened the slip. Carries the
 * authoritative odds so the UI can re-prompt with the fresh number.
 */
export class OddsDriftError extends Error {
  readonly latestOdds: number | null;

  constructor(message: string, latestOdds: number | null) {
    super(message);
    this.name = 'OddsDriftError';
    this.latestOdds = latestOdds;
  }
}

// Postgres ERRCODE used by place_bet for the drift branch (see migration
// 20260514091027_place_bet_hard_guards.sql). P0002 is reserved by Postgres
// for plpgsql NO_DATA_FOUND, but it is harmless to overload here because
// place_bet never throws the real NO_DATA_FOUND — every NOT FOUND path
// raises with a distinct message.
const ODDS_DRIFT_PG_ERRCODE = 'P0002';

const ODDS_DRIFT_RE = /Odds changed.*?expected\s+([\d.]+).*?actual\s+([\d.]+)/i;

function tryParseLatestOdds(message: string): number | null {
  const match = ODDS_DRIFT_RE.exec(message);
  if (!match) return null;
  const actual = Number(match[2]);
  return Number.isFinite(actual) ? actual : null;
}

export function usePlaceBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: PlaceBetInput): Promise<string> => {
      const { data: betId, error } = await supabase.rpc('place_bet', {
        p_market_id: vars.marketId,
        p_outcome_id: vars.outcomeId,
        p_stake: vars.stake,
        p_expected_odds: vars.expectedOdds,
      });

      if (error) {
        if (error.code === ODDS_DRIFT_PG_ERRCODE || /Odds changed/i.test(error.message)) {
          throw new OddsDriftError(error.message, tryParseLatestOdds(error.message));
        }
        throw new Error(error.message);
      }
      return betId as string;
    },
    onSuccess: () => {
      // Balance update is not covered by realtime, so must be invalidated explicitly.
      // Bets list is covered by the useMyBets realtime channel (INSERT on bets fires it).
      queryClient.invalidateQueries({ queryKey: ['user', 'balance'] });
    },
  });
}
