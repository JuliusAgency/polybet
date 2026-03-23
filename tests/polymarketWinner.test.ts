import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWinnerTokenId } from '../supabase/functions/_shared/polymarketWinner.ts';

test('resolveWinnerTokenId prefers explicit winner tokens when prices are inconclusive', async () => {
  const winnerTokenId = await resolveWinnerTokenId({
    market: {
      conditionId: 'market-1',
      outcomePrices: '["0","0"]',
      clobTokenIds: '["token-a","token-b"]',
      tokens: [
        { token_id: 'token-a', winner: false },
        { token_id: 'token-b', winner: true },
      ],
    },
    fetchMarketDetails: async () => {
      throw new Error('details fetch should not be used when tokens already include a winner');
    },
  });

  assert.equal(winnerTokenId, 'token-b');
});

test('resolveWinnerTokenId falls back to market detail lookup when list response lacks winner data', async () => {
  const winnerTokenId = await resolveWinnerTokenId({
    market: {
      conditionId: 'market-2',
      outcomePrices: '["0","0"]',
      clobTokenIds: '["token-a","token-b"]',
    },
    fetchMarketDetails: async () => ({
      tokens: [
        { token_id: 'token-a', winner: true },
        { token_id: 'token-b', winner: false },
      ],
    }),
  });

  assert.equal(winnerTokenId, 'token-a');
});
