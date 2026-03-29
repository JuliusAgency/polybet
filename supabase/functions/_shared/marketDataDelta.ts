export type MarketDeltaEventType =
  | 'market_created'
  | 'status_changed'
  | 'outcome_price_changed'
  | 'market_resolved';

export interface MarketDataDeltaInsert {
  market_id: string;
  outcome_id: string | null;
  polymarket_id: string;
  polymarket_token_id: string | null;
  event_type: MarketDeltaEventType;
  old_value: string | null;
  new_value: string | null;
  run_id: string | null;
  changed_at: string;
}

function serializeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function buildMarketCreatedDelta(params: {
  marketId: string;
  polymarketId: string;
  runId: string | null;
  changedAt: string;
  payload: unknown;
}): MarketDataDeltaInsert {
  return {
    market_id: params.marketId,
    outcome_id: null,
    polymarket_id: params.polymarketId,
    polymarket_token_id: null,
    event_type: 'market_created',
    old_value: null,
    new_value: serializeValue(params.payload),
    run_id: params.runId,
    changed_at: params.changedAt,
  };
}

export function buildMarketStatusDelta(params: {
  marketId: string;
  polymarketId: string;
  previousStatus: string | null;
  nextStatus: string;
  runId: string | null;
  changedAt: string;
}): MarketDataDeltaInsert | null {
  if (params.previousStatus === params.nextStatus) {
    return null;
  }

  return {
    market_id: params.marketId,
    outcome_id: null,
    polymarket_id: params.polymarketId,
    polymarket_token_id: null,
    event_type: 'status_changed',
    old_value: serializeValue(params.previousStatus),
    new_value: serializeValue(params.nextStatus),
    run_id: params.runId,
    changed_at: params.changedAt,
  };
}

export function buildOutcomePriceDeltas(params: {
  marketId: string;
  polymarketId: string;
  runId: string | null;
  changedAt: string;
  existingByToken: Map<string, number | null>;
  nextOutcomes: Array<{ tokenId: string; price: number }>;
}): MarketDataDeltaInsert[] {
  return params.nextOutcomes
    .filter(({ tokenId, price }) => {
      const previous = params.existingByToken.get(tokenId);
      if (previous === undefined || previous === null) {
        return false;
      }
      return Math.abs(previous - price) >= 0.0000001;
    })
    .map(({ tokenId, price }) => {
      const previous = params.existingByToken.get(tokenId) ?? null;
      return {
        market_id: params.marketId,
        outcome_id: null,
        polymarket_id: params.polymarketId,
        polymarket_token_id: tokenId,
        event_type: 'outcome_price_changed' as const,
        old_value: serializeValue(previous),
        new_value: serializeValue(price),
        run_id: params.runId,
        changed_at: params.changedAt,
      };
    });
}

export function buildMarketResolvedDelta(params: {
  marketId: string;
  polymarketId: string;
  runId: string | null;
  changedAt: string;
  previousWinningOutcomeId: string | null;
  winningOutcomeId: string;
}): MarketDataDeltaInsert {
  return {
    market_id: params.marketId,
    outcome_id: params.winningOutcomeId,
    polymarket_id: params.polymarketId,
    polymarket_token_id: null,
    event_type: 'market_resolved',
    old_value: serializeValue(params.previousWinningOutcomeId),
    new_value: serializeValue(params.winningOutcomeId),
    run_id: params.runId,
    changed_at: params.changedAt,
  };
}
