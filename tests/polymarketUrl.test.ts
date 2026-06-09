import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polymarketEventUrl } from '../src/shared/utils/polymarketUrl.ts';

test('builds the canonical /event/ URL from a slug', () => {
  assert.equal(
    polymarketEventUrl('will-eth-be-above-1500'),
    'https://polymarket.com/event/will-eth-be-above-1500'
  );
});

test('encodes unsafe characters in the slug', () => {
  assert.equal(polymarketEventUrl('a b/c'), 'https://polymarket.com/event/a%20b%2Fc');
});
