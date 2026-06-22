import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeAuthedFunction, SESSION_EXPIRED_ERROR } from '../src/shared/api/supabase/invokeAuthedFunction.ts';

interface SessionResponse {
  data: { session: { access_token: string; expires_at?: number } | null };
  error: Error | null;
}

interface RefreshResponse {
  data: { session: { access_token: string; expires_at?: number } | null };
  error: Error | null;
}

function createClient({
  session,
  refreshedSession,
}: {
  session: SessionResponse;
  refreshedSession?: RefreshResponse;
}) {
  const invokeCalls: Array<{ functionName: string; options: unknown }> = [];
  let signOutCalls = 0;

  return {
    client: {
      auth: {
        async getSession() {
          return session;
        },
        async refreshSession() {
          return (
            refreshedSession ?? {
              data: { session: null },
              error: null,
            }
          );
        },
        async signOut() {
          signOutCalls += 1;
        },
      },
      functions: {
        async invoke(functionName: string, options: unknown) {
          invokeCalls.push({ functionName, options });
          return { data: { ok: true }, error: null };
        },
      },
    },
    invokeCalls,
    getSignOutCalls: () => signOutCalls,
  };
}

test('invokeAuthedFunction sends the current access token to edge functions', async () => {
  const { client, invokeCalls } = createClient({
    session: {
      data: { session: { access_token: 'current-token' } },
      error: null,
    },
  });

  await invokeAuthedFunction(client, 'create-user', {
    body: { role: 'manager' },
    headers: { 'X-Trace-Id': 'trace-1' },
  });

  assert.equal(invokeCalls.length, 1);
  assert.deepEqual(invokeCalls[0], {
    functionName: 'create-user',
    options: {
      body: { role: 'manager' },
      headers: {
        Authorization: 'Bearer current-token',
        'X-Trace-Id': 'trace-1',
      },
    },
  });
});

test('invokeAuthedFunction refreshes the session before invoking when needed', async () => {
  const { client, invokeCalls } = createClient({
    session: {
      data: { session: null },
      error: null,
    },
    refreshedSession: {
      data: { session: { access_token: 'refreshed-token' } },
      error: null,
    },
  });

  await invokeAuthedFunction(client, 'create-user', {
    body: { role: 'user' },
  });

  assert.equal(invokeCalls.length, 1);
  assert.deepEqual(invokeCalls[0], {
    functionName: 'create-user',
    options: {
      body: { role: 'user' },
      headers: {
        Authorization: 'Bearer refreshed-token',
      },
    },
  });
});

test('invokeAuthedFunction refreshes proactively when the cached token is near expiry', async () => {
  const nowSeconds = Date.now() / 1000;
  const { client, invokeCalls } = createClient({
    // Cached session exists but expires in 5s — must NOT be reused.
    session: {
      data: { session: { access_token: 'stale-token', expires_at: nowSeconds + 5 } },
      error: null,
    },
    refreshedSession: {
      data: { session: { access_token: 'fresh-token' } },
      error: null,
    },
  });

  await invokeAuthedFunction(client, 'quote-bet', { body: { x: 1 } });

  assert.equal(invokeCalls.length, 1);
  assert.equal(
    (invokeCalls[0].options as { headers: Record<string, string> }).headers.Authorization,
    'Bearer fresh-token'
  );
});

test('invokeAuthedFunction retries once with a refreshed token on a 401', async () => {
  let calls = 0;
  const invokeCalls: Array<{ functionName: string; options: unknown }> = [];
  const client = {
    auth: {
      async getSession() {
        return { data: { session: { access_token: 'expired-but-present' } }, error: null };
      },
      async refreshSession() {
        return { data: { session: { access_token: 'refreshed-token' } }, error: null };
      },
      async signOut() {},
    },
    functions: {
      async invoke(functionName: string, options: unknown) {
        calls += 1;
        invokeCalls.push({ functionName, options });
        // First call: simulate the edge function rejecting our token (401).
        if (calls === 1) {
          return { data: null, error: { context: { status: 401 } } };
        }
        return { data: { ok: true }, error: null };
      },
    },
  };

  const result = await invokeAuthedFunction(client, 'market-price-history', { body: { id: 'm1' } });

  assert.equal(calls, 2);
  assert.equal(
    (invokeCalls[0].options as { headers: Record<string, string> }).headers.Authorization,
    'Bearer expired-but-present'
  );
  assert.equal(
    (invokeCalls[1].options as { headers: Record<string, string> }).headers.Authorization,
    'Bearer refreshed-token'
  );
  assert.deepEqual((result as { data: unknown }).data, { ok: true });
});

test('invokeAuthedFunction throws a session error instead of sending a publishable key', async () => {
  const { client, invokeCalls, getSignOutCalls } = createClient({
    session: {
      data: { session: null },
      error: null,
    },
    refreshedSession: {
      data: { session: null },
      error: null,
    },
  });

  await assert.rejects(
    () => invokeAuthedFunction(client, 'create-user', { body: { role: 'manager' } }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, SESSION_EXPIRED_ERROR);
      return true;
    },
  );

  assert.equal(invokeCalls.length, 0);
  assert.equal(getSignOutCalls(), 1);
});
