import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('useSimilarEvents filters by category and excludes resolved/archived', () => {
  const source = fs.readFileSync('src/features/bet/useSimilarEvents.ts', 'utf8');

  assert.match(source, /\.from\('events'\)/);
  assert.match(source, /\.eq\('is_visible',\s*true\)/);
  assert.match(source, /\.eq\('category',\s*category\)/);
  assert.match(source, /\.neq\('status',\s*'resolved'\)/);
  assert.match(source, /\.neq\('status',\s*'archived'\)/);
  assert.match(source, /\.neq\('id',\s*excludeEventId\)/);
  assert.match(source, /\.limit\(SIMILAR_EVENTS_LIMIT\)/);
});

test('useSimilarEvents is disabled without category or excludeEventId', () => {
  const source = fs.readFileSync('src/features/bet/useSimilarEvents.ts', 'utf8');
  assert.match(source, /enabled:\s*enabled\s*&&\s*!!category\s*&&\s*!!excludeEventId/);
});
