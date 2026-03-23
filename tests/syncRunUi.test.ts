import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSyncRunProgressPercent,
  isSyncRunProgressIndeterminate,
  isSyncRunTerminal,
  SYNC_SCOPE_OPTIONS,
} from '../src/features/admin/settlement/syncRunUi.ts';

test('sync scope options include batch presets and all markets', () => {
  assert.deepEqual(
    SYNC_SCOPE_OPTIONS.map((option) => option.maxPages),
    [1, 5, 10, 0],
  );
});

test('getSyncRunProgressPercent uses exact ratio while a run is active', () => {
  assert.equal(
    getSyncRunProgressPercent({ status: 'running', progress_current: 3, progress_total: 12 }),
    25,
  );
});

test('getSyncRunProgressPercent reports 100 for completed runs with zero totals', () => {
  assert.equal(
    getSyncRunProgressPercent({ status: 'completed', progress_current: 0, progress_total: 0 }),
    100,
  );
});

test('isSyncRunTerminal returns true for all terminal sync outcomes', () => {
  assert.equal(isSyncRunTerminal('running'), false);
  assert.equal(isSyncRunTerminal('completed'), true);
  assert.equal(isSyncRunTerminal('completed_with_warnings'), true);
  assert.equal(isSyncRunTerminal('failed'), true);
});

test('isSyncRunProgressIndeterminate returns true while totals are still unknown', () => {
  assert.equal(
    isSyncRunProgressIndeterminate({ status: 'running', progress_total: 0 }),
    true,
  );
  assert.equal(
    isSyncRunProgressIndeterminate({ status: 'completed', progress_total: 0 }),
    false,
  );
});
