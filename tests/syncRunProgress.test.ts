import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFetchedProgressUpdate,
  buildIncrementedProgressUpdate,
  buildStartedProgressUpdate,
} from '../supabase/functions/_shared/syncRunProgress.ts';

test('buildStartedProgressUpdate initializes a sync run in starting state', () => {
  assert.deepEqual(buildStartedProgressUpdate(10), {
    status: 'running',
    phase: 'starting',
    max_pages: 10,
    progress_current: 0,
    progress_total: 0,
    error_message: null,
    finished_at: null,
  });
});

test('buildFetchedProgressUpdate sets the total number of markets to process', () => {
  assert.deepEqual(buildFetchedProgressUpdate(12, 3), {
    phase: 'syncing_active',
    progress_current: 0,
    progress_total: 15,
  });
});

test('buildIncrementedProgressUpdate advances progress and switches phase after active markets', () => {
  assert.deepEqual(buildIncrementedProgressUpdate({
    processedCount: 12,
    activeCount: 12,
    totalCount: 15,
  }), {
    progress_current: 12,
    progress_total: 15,
    phase: 'syncing_resolved',
  });
});
