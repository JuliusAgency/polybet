import test from 'node:test';
import assert from 'node:assert/strict';

const {
  bootstrapAuthState,
  createForceSignOut,
} = await import('../src/app/providers/AuthProvider/AuthProvider.tsx');

test('blocked profile on initial bootstrap signs out once and does not hydrate profile state', async () => {
  const session = {
    user: {
      id: 'user-1',
    },
  };

  const profileRow = {
    id: 'user-1',
    username: 'blocked-user',
    full_name: 'Blocked User',
    role: 'user' as const,
    phone: null,
    notes: null,
    is_active: false,
    created_by: null,
    created_at: '2026-03-29T00:00:00.000Z',
  };

  let getSessionCalls = 0;
  let signOutCalls = 0;
  let profileCalls = 0;
  let roleCalls = 0;
  const sessionUpdates: Array<typeof session | null> = [];
  const userUpdates: Array<typeof session.user | null> = [];
  const loadingUpdates: boolean[] = [];

  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({
      data: profileRow,
      error: null,
    }),
  };

  const client = {
    auth: {
      async getSession() {
        getSessionCalls += 1;
        return {
          data: { session },
          error: null,
        };
      },
    },
    from: () => query,
  };

  const revocation = createForceSignOut(async () => {
    signOutCalls += 1;
  });

  await bootstrapAuthState(client, {
    forceSignOut: revocation.forceSignOut,
    resetForceSignOut: revocation.resetForceSignOut,
    setLoading: (loading) => {
      loadingUpdates.push(loading);
    },
    setProfile: () => {
      profileCalls += 1;
    },
    setRole: () => {
      roleCalls += 1;
    },
    setSession: (nextSession) => {
      sessionUpdates.push(nextSession);
    },
    setUser: (nextUser) => {
      userUpdates.push(nextUser);
    },
  });

  await revocation.forceSignOut();
  await revocation.forceSignOut();

  assert.equal(getSessionCalls, 1);
  assert.equal(signOutCalls, 1);
  assert.deepEqual(sessionUpdates, [session]);
  assert.deepEqual(userUpdates, [session.user]);
  assert.deepEqual(loadingUpdates, [false]);
  assert.equal(profileCalls, 0);
  assert.equal(roleCalls, 0);
});

test('forceSignOut retries after a failed signOut response', async () => {
  const errors: unknown[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  let attempts = 0;
  const revocation = createForceSignOut(async () => {
    attempts += 1;
    return attempts === 1
      ? { error: { message: 'boom' } }
      : { error: null };
  });

  try {
    await revocation.forceSignOut();
    await revocation.forceSignOut();

    assert.equal(attempts, 2);
    assert.equal(errors.length, 1);
  } finally {
    console.error = originalConsoleError;
  }
});
