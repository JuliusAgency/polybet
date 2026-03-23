import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSyncStartResponse } from '../src/features/admin/settlement/syncStartResponse.ts';

test('parseSyncStartResponse accepts an async sync acknowledgement payload', () => {
  assert.deepEqual(
    parseSyncStartResponse({
      run_id: 'run-1',
      success: true,
      accepted: true,
    }),
    {
      run_id: 'run-1',
      success: true,
      accepted: true,
    },
  );
});

test('parseSyncStartResponse rejects payloads without a run id', () => {
  assert.throws(
    () => parseSyncStartResponse({ success: true }),
    /Unexpected response shape from sync function/,
  );
});
