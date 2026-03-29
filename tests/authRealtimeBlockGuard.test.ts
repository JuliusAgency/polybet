import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createForceSignOut,
  loadProfileFromSupabase,
} from '../src/app/providers/AuthProvider/AuthProvider.tsx';

test('blocked profiles trigger one forced sign-out and never hydrate auth state', async () => {
  const blockedProfile = {
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

  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({
      data: blockedProfile,
      error: null,
    }),
  };

  const supabaseMock = {
    from: () => query,
  };

  let signOutCalls = 0;
  let setProfileCalls = 0;
  let setRoleCalls = 0;
  const revocation = createForceSignOut(async () => {
    signOutCalls += 1;
  });

  await loadProfileFromSupabase(supabaseMock, 'user-1', {
    forceSignOut: revocation.forceSignOut,
    setProfile: () => {
      setProfileCalls += 1;
    },
    setRole: () => {
      setRoleCalls += 1;
    },
  });

  await loadProfileFromSupabase(supabaseMock, 'user-1', {
    forceSignOut: revocation.forceSignOut,
    setProfile: () => {
      setProfileCalls += 1;
    },
    setRole: () => {
      setRoleCalls += 1;
    },
  });

  assert.equal(signOutCalls, 1);
  assert.equal(setProfileCalls, 0);
  assert.equal(setRoleCalls, 0);
});
