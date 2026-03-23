import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompletedProgressUpdate,
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

test('buildCompletedProgressUpdate preserves completion when only non-fatal issues were collected', () => {
  const result = buildCompletedProgressUpdate({
    processedCount: 15,
    totalCount: 15,
    stats: {
      markets_synced: 10,
      outcomes_updated: 20,
      markets_settled: 5,
      errors: ['Resolved market abc: winner not available yet'],
    },
  });

  assert.equal(result.status, 'completed_with_warnings');
  assert.equal(result.phase, 'completed_with_warnings');
  assert.equal(result.progress_current, 15);
  assert.equal(result.progress_total, 15);
  assert.equal(result.markets_synced, 10);
  assert.equal(result.outcomes_updated, 20);
  assert.equal(result.markets_settled, 5);
  assert.deepEqual(result.errors, ['Resolved market abc: winner not available yet']);
  assert.equal(result.error_message, 'Resolved market abc: winner not available yet');
  assert.match(result.finished_at, /^\d{4}-\d{2}-\d{2}T/);
});
