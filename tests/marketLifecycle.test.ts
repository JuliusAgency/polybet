import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArchiveCutoffIso, parseArchiveAfterHours } from '../supabase/functions/_shared/marketLifecycle.ts';

test('parseArchiveAfterHours falls back when value is missing or invalid', () => {
  assert.equal(parseArchiveAfterHours(undefined, 168), 168);
  assert.equal(parseArchiveAfterHours('invalid', 168), 168);
  assert.equal(parseArchiveAfterHours('-5', 168), 168);
});

test('parseArchiveAfterHours accepts numeric and string values', () => {
  assert.equal(parseArchiveAfterHours(24, 168), 24);
  assert.equal(parseArchiveAfterHours('72', 168), 72);
});

test('buildArchiveCutoffIso subtracts the configured number of hours', () => {
  const now = new Date('2026-03-29T12:00:00.000Z');
  assert.equal(
    buildArchiveCutoffIso({ archiveAfterHours: 48, now }),
    '2026-03-27T12:00:00.000Z',
  );
});
