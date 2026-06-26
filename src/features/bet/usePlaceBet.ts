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

// Postgres deadlock (SQLSTATE 40P01). Concurrent buys/sells/settlement on the
// same market take the markets / balances / positions row locks; under load the
// loser of a lock-order race is aborted with 40P01. place_bet is atomic, so the
// aborted side is always safe to retry — do so a couple times with a short
// backoff before surfacing the raw error.
const DEADLOCK_PG_ERRCODE = '40P01';
const DEADLOCK_RETRIES = 2;
const DEADLOCK_BACKOFF_MS = 150;

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
      for (let attempt = 0; ; attempt++) {
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
          if (error.code === DEADLOCK_PG_ERRCODE && attempt < DEADLOCK_RETRIES) {
            await new Promise((r) => setTimeout(r, DEADLOCK_BACKOFF_MS * (attempt + 1)));
            continue;
          }
          throw new Error(error.message);
        }
        return betId as string;
      }
    },
    onSuccess: () => {
      // Balance + positions/trades are not covered by realtime (positions is not
      // in the realtime publication), so invalidate them explicitly. A buy
      // upserts the user's position and appends a trade.
      queryClient.invalidateQueries({ queryKey: ['user', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'positions'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'position-history'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'trades'] });
    },
  });
}
