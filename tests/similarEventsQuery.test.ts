import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('useSimilarEvents filters by tag or category and excludes resolved/archived', () => {
  const source = fs.readFileSync('src/features/bet/useSimilarEvents.ts', 'utf8');

  assert.match(source, /\.from\('events'\)/);
  assert.match(source, /\.eq\('is_visible',\s*true\)/);
  assert.match(source, /\.neq\('status',\s*'resolved'\)/);
  assert.match(source, /\.neq\('status',\s*'archived'\)/);
  assert.match(source, /\.neq\('id',\s*eventId\)/);
  assert.match(source, /\.limit\(SIMILAR_EVENTS_LIMIT\)/);
  assert.match(source, /tag_slug\.eq\./);
  assert.match(source, /category\.eq\./);
  assert.match(source, /\.or\(orParts\.join\(','\)\)/);
  assert.match(source, /tag_slug/);
  assert.match(source, /tag_label/);
});

test('useSimilarEvents is disabled without eventId or any filter', () => {
  const source = fs.readFileSync('src/features/bet/useSimilarEvents.ts', 'utf8');
  assert.match(source, /enabled:\s*enabled\s*&&\s*!!eventId\s*&&\s*hasFilter/);
  assert.match(source, /const hasFilter = Boolean\(tagSlug\) \|\| Boolean\(category\);/);
});

test('useSimilarEvents ranks same-tag first, then same-category, then volume', () => {
  const source = fs.readFileSync('src/features/bet/useSimilarEvents.ts', 'utf8');
  assert.match(source, /rows\.slice\(\)\.sort/);
  assert.match(source, /a\.tag_slug === tagSlug/);
  assert.match(source, /a\.category === category/);
  assert.match(source, /\(b\.volume \?\? 0\) - \(a\.volume \?\? 0\)/);
});
