import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSyncAuthorization } from '../supabase/functions/_shared/syncAuth.ts';

test('sync authorization requires an Authorization header', () => {
  assert.deepEqual(
    evaluateSyncAuthorization({
      authHeader: null,
      callerUserId: null,
      callerRole: null,
    }),
    { ok: false, status: 401, body: { error: 'Unauthorized' } },
  );
});

test('sync authorization rejects non-super-admin roles', () => {
  assert.deepEqual(
    evaluateSyncAuthorization({
      authHeader: 'Bearer token',
      callerUserId: 'user-1',
      callerRole: 'manager',
    }),
    { ok: false, status: 403, body: { error: 'Forbidden' } },
  );
});

test('sync authorization allows super admin callers', () => {
  assert.deepEqual(
    evaluateSyncAuthorization({
      authHeader: 'Bearer token',
      callerUserId: 'user-1',
      callerRole: 'super_admin',
    }),
    { ok: true, callerId: 'user-1' },
  );
});

test('sync authorization allows service role callers', () => {
  assert.deepEqual(
    evaluateSyncAuthorization({
      authHeader: 'Bearer service-role',
      callerUserId: null,
      callerRole: null,
      serviceRoleAuthorized: true,
    }),
    { ok: true, callerId: null },
  );
});
