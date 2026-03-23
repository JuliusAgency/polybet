import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeEdgeRequest } from '../supabase/functions/_shared/edgeAuthRules.ts';

test('sync authorization requires an Authorization header', () => {
  assert.deepEqual(
    authorizeEdgeRequest({
      authHeader: null,
      callerUserId: null,
      callerRole: null,
    }),
    { ok: false, status: 401, body: { error: 'Unauthorized' } },
  );
});

test('sync authorization rejects non-super-admin roles', () => {
  assert.deepEqual(
    authorizeEdgeRequest({
      authHeader: 'Bearer token',
      callerUserId: 'user-1',
      callerRole: 'manager',
    }, {
      allowedRoles: ['super_admin'],
    }),
    { ok: false, status: 403, body: { error: 'Forbidden' } },
  );
});

test('sync authorization allows super admin callers', () => {
  assert.deepEqual(
    authorizeEdgeRequest({
      authHeader: 'Bearer token',
      callerUserId: 'user-1',
      callerRole: 'super_admin',
    }, {
      allowedRoles: ['super_admin'],
    }),
    { ok: true, callerId: 'user-1', callerRole: 'super_admin', isServiceRole: false },
  );
});

test('sync authorization allows service role callers', () => {
  assert.deepEqual(
    authorizeEdgeRequest({
      authHeader: 'Bearer service-role',
      callerUserId: null,
      callerRole: null,
      serviceRoleAuthorized: true,
    }, {
      allowServiceRole: true,
    }),
    { ok: true, callerId: null, callerRole: null, isServiceRole: true },
  );
});
