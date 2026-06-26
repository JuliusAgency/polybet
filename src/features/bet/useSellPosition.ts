import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export interface SellPositionInput {
  positionId: string;
  /** Shares to sell (≤ held). */
  shares: number;
  /** Bid-derived average sell price the user saw, for the drift guard. */
  expectedPrice: number;
}

export interface SellPositionResult {
  position_id: string;
  trade_id: string;
  sold_shares: number;
  proceeds: number;
  avg_sell_price: number;
  realized_pnl: number;
  remaining_shares: number;
  status: 'open' | 'closed';
}

/**
 * Thrown when sell_position rejects because the bid-derived price drifted
 * beyond tolerance since the user opened the slip. Carries the authoritative
 * price so the UI can re-prompt with the fresh number.
 */
export class PriceDriftError extends Error {
  readonly latestPrice: number | null;

  constructor(message: string, latestPrice: number | null) {
    super(message);
    this.name = 'PriceDriftError';
    this.latestPrice = latestPrice;
  }
}

// sell_position raises the drift branch with ERRCODE P0002 (see migration
// 20260602130622_quote_sell_and_sell_position.sql), mirroring place_bet.
const PRICE_DRIFT_PG_ERRCODE = 'P0002';

// Postgres deadlock (SQLSTATE 40P01) — see usePlaceBet for the rationale. A
// sell can deadlock against a concurrent buy/settlement on the shared
// market / balances / position row locks; sell_position is atomic so the
// aborted side is safe to retry.
const DEADLOCK_PG_ERRCODE = '40P01';
const DEADLOCK_RETRIES = 2;
const DEADLOCK_BACKOFF_MS = 150;

const PRICE_DRIFT_RE = /Price changed.*?expected\s+([\d.]+).*?actual\s+([\d.]+)/i;

function tryParseLatestPrice(message: string): number | null {
  const match = PRICE_DRIFT_RE.exec(message);
  if (!match) return null;
  const actual = Number(match[2]);
  return Number.isFinite(actual) ? actual : null;
}

export function useSellPosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: SellPositionInput): Promise<SellPositionResult> => {
      for (let attempt = 0; ; attempt++) {
        const { data, error } = await supabase.rpc('sell_position', {
          p_position_id: vars.positionId,
          p_shares: vars.shares,
          p_expected_price: vars.expectedPrice,
        });

        if (error) {
          if (error.code === PRICE_DRIFT_PG_ERRCODE || /Price changed/i.test(error.message)) {
            throw new PriceDriftError(error.message, tryParseLatestPrice(error.message));
          }
          if (error.code === DEADLOCK_PG_ERRCODE && attempt < DEADLOCK_RETRIES) {
            await new Promise((r) => setTimeout(r, DEADLOCK_BACKOFF_MS * (attempt + 1)));
            continue;
          }
          throw new Error(error.message);
        }
        return data as SellPositionResult;
      }
    },
    onSuccess: () => {
      // Balance + positions are not covered by realtime; invalidate explicitly.
      queryClient.invalidateQueries({ queryKey: ['user', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'positions'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'position-history'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'trades'] });
    },
  });
}
