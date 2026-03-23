import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCorsPreflightResponse, withCorsHeaders } from '../supabase/functions/_shared/cors.ts';

test('buildCorsPreflightResponse returns 204 with required CORS headers', () => {
  const response = buildCorsPreflightResponse('GET, POST, OPTIONS');

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(
    response.headers.get('Access-Control-Allow-Headers'),
    'authorization, x-client-info, apikey, content-type',
  );
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
});

test('withCorsHeaders preserves existing headers while adding CORS defaults', () => {
  const headers = withCorsHeaders({ 'Content-Type': 'application/json' });

  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers['Access-Control-Allow-Origin'], '*');
  assert.equal(headers['Access-Control-Allow-Methods'], 'GET, POST, OPTIONS');
});
