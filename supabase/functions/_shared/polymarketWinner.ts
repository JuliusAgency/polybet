interface WinnerTokenCandidate {
  token_id: string;
  winner?: boolean;
}

interface WinnerMarketCandidate {
  conditionId: string;
  outcomePrices: string;
  clobTokenIds: string;
  tokens?: WinnerTokenCandidate[];
}

interface WinnerMarketDetails {
  tokens?: WinnerTokenCandidate[];
}

interface ResolveWinnerTokenIdParams {
  market: WinnerMarketCandidate;
  fetchMarketDetails?: () => Promise<WinnerMarketDetails | null | undefined>;
}

function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function findWinnerTokenInTokens(tokens: WinnerTokenCandidate[] | undefined): string | null {
  const winnerToken = tokens?.find((token) => token.winner === true);
  return winnerToken?.token_id ?? null;
}

function findWinnerTokenInPrices(market: WinnerMarketCandidate): string | null {
  const prices = parseJsonField<string[]>(market.outcomePrices, []);
  const tokenIds = parseJsonField<string[]>(market.clobTokenIds, []);
  const winnerIndex = prices.findIndex((price) => parseFloat(price) >= 0.99);

  if (winnerIndex === -1) {
    return null;
  }

  return tokenIds[winnerIndex] ?? null;
}

export async function resolveWinnerTokenId(
  params: ResolveWinnerTokenIdParams,
): Promise<string | null> {
  const directTokenWinner = findWinnerTokenInTokens(params.market.tokens);
  if (directTokenWinner) {
    return directTokenWinner;
  }

  const priceWinner = findWinnerTokenInPrices(params.market);
  if (priceWinner) {
    return priceWinner;
  }

  if (!params.fetchMarketDetails) {
    return null;
  }

  try {
    const marketDetails = await params.fetchMarketDetails();
    return findWinnerTokenInTokens(marketDetails?.tokens);
  } catch {
    return null;
  }
}
