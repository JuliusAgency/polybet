import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapBalanceErrorMessage } from '../src/shared/utils/mapBalanceError.ts';

// Stub translator: returns the key so we can assert which key was chosen.
const t = (key: string): string => key;

test('maps the exact "Insufficient balance" RPC message to the localized key', () => {
  assert.equal(mapBalanceErrorMessage('Insufficient balance', t), 'treasury.insufficientBalance');
});

test('maps the "Insufficient balance for user" variant (substring, case-insensitive)', () => {
  assert.equal(
    mapBalanceErrorMessage('INSUFFICIENT BALANCE for user', t),
    'treasury.insufficientBalance'
  );
});

test('passes through unrelated RPC errors unchanged', () => {
  assert.equal(mapBalanceErrorMessage('User is blocked', t), 'User is blocked');
});

test('passes through an empty message unchanged (caller applies its own fallback)', () => {
  assert.equal(mapBalanceErrorMessage('', t), '');
});
