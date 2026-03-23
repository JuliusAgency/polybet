import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJsonWithRetry } from '../supabase/functions/_shared/gammaFetch.ts';

test('fetchJsonWithRetry retries after a transient fetch failure', async () => {
  let attempts = 0;

  const result = await fetchJsonWithRetry<{ ok: boolean }>('https://gamma.example/markets', {
    maxAttempts: 2,
    timeoutMs: 100,
    heartbeatMs: 1000,
    fetchImpl: async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('temporary network error');
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    sleep: async () => {},
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result, { ok: true });
});

test('fetchJsonWithRetry emits heartbeat while waiting for a slow response', async () => {
  let heartbeatCount = 0;

  await fetchJsonWithRetry<{ ok: boolean }>('https://gamma.example/markets', {
    maxAttempts: 1,
    timeoutMs: 100,
    heartbeatMs: 5,
    fetchImpl: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onHeartbeat: () => {
      heartbeatCount++;
    },
  });

  assert.ok(heartbeatCount >= 2);
});
