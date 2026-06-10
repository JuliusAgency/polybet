import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polymarketMarketUrl } from '../src/shared/utils/polymarketUrl.ts';

test('deep-links to the market when the market slug differs from the event slug', () => {
  assert.equal(
    polymarketMarketUrl('democratic-nominee-2028', 'will-james-talarico-win'),
    'https://polymarket.com/event/democratic-nominee-2028/will-james-talarico-win'
  );
});

test('links to the event page only when the slugs are equal (single-market event)', () => {
  assert.equal(
    polymarketMarketUrl('will-eth-be-above-1500', 'will-eth-be-above-1500'),
    'https://polymarket.com/event/will-eth-be-above-1500'
  );
});

test('links to the event page when the market slug is null', () => {
  assert.equal(
    polymarketMarketUrl('will-eth-be-above-1500', null),
    'https://polymarket.com/event/will-eth-be-above-1500'
  );
});

test('links to the event page when the market slug is undefined', () => {
  assert.equal(
    polymarketMarketUrl('will-eth-be-above-1500'),
    'https://polymarket.com/event/will-eth-be-above-1500'
  );
});

test('encodes unsafe characters in both segments', () => {
  assert.equal(
    polymarketMarketUrl('a b/c', 'd e/f'),
    'https://polymarket.com/event/a%20b%2Fc/d%20e%2Ff'
  );
});

test('encodes unsafe characters when only the event slug is present', () => {
  assert.equal(polymarketMarketUrl('a b/c'), 'https://polymarket.com/event/a%20b%2Fc');
});
