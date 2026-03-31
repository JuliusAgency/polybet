import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const pageFile = path.resolve('src/pages/super-admin/GlobalBetLogPage/GlobalBetLogPage.tsx');
const hookFile = path.resolve('src/features/admin/reports/useExportAdminReport.ts');

test('global admin page exposes PDF export controls', () => {
  const source = readFileSync(pageFile, 'utf8');

  assert.match(source, /useExportAdminReport/);
  assert.match(source, /report_type|reportType/);
  assert.match(source, /Export PDF|reports\.exportPdf/);
  assert.match(source, /reports\.types\.system_summary/);
});

test('report export hook invokes export-admin-report edge function', () => {
  const source = readFileSync(hookFile, 'utf8');

  assert.match(source, /invokeSupabaseFunction/);
  assert.match(source, /export-admin-report/);
  assert.match(source, /report_type/);
});
