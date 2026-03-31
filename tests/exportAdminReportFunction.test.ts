import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const functionDir = path.resolve('supabase/functions/export-admin-report');
const indexFile = path.join(functionDir, 'index.ts');
const buildersFile = path.join(functionDir, 'reportBuilders.ts');
const rendererFile = path.join(functionDir, 'pdfRenderer.ts');

test('export admin report edge function exposes the required surface', () => {
  assert.equal(existsSync(indexFile), true);
  assert.equal(existsSync(buildersFile), true);
  assert.equal(existsSync(rendererFile), true);

  const indexSource = readFileSync(indexFile, 'utf8');

  assert.match(indexSource, /Deno\.serve\(/);
  assert.match(indexSource, /req\.method !== 'POST'/);
  assert.match(indexSource, /authorizeEdgeCall\s*\(\s*req,\s*\{[\s\S]*allowedRoles:\s*\['super_admin'\]/);
  assert.match(indexSource, /admin_get_report_dataset/);
  assert.match(indexSource, /application\/pdf/);
  assert.match(indexSource, /content-disposition/i);
  assert.match(indexSource, /admin_action_logs/);
  assert.match(indexSource, /pdf_render_failed/);
});
