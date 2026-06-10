// CORS policy for edge functions.
//
// In production the allowed origin is locked to the app's own domain so a
// malicious page cannot drive these endpoints with a victim's bearer token.
// Locally (functions running against the 127.0.0.1 stack) we fall back to '*'
// so dev + e2e keep working without extra config. Override per-environment via
// the CORS_ALLOW_ORIGIN env var (e.g. a preview deployment domain).
const PROD_ALLOW_ORIGIN = 'https://polybet-mu.vercel.app';

function resolveAllowOrigin(): string {
  const override = Deno.env.get('CORS_ALLOW_ORIGIN');
  if (override && override.length > 0) return override;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const isLocal = supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost');
  return isLocal ? '*' : PROD_ALLOW_ORIGIN;
}

const ALLOW_ORIGIN = resolveAllowOrigin();

export const DEFAULT_CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // When the origin is not '*', responses vary by Origin — let caches know.
  ...(ALLOW_ORIGIN === '*' ? {} : { Vary: 'Origin' }),
};

export function withCorsHeaders(headers: Record<string, string> = {}) {
  return {
    ...DEFAULT_CORS_HEADERS,
    ...headers,
  };
}

export function buildCorsPreflightResponse(methods = 'GET, POST, OPTIONS') {
  return new Response(null, {
    status: 204,
    headers: withCorsHeaders({
      'Access-Control-Allow-Methods': methods,
    }),
  });
}

export function jsonWithCors(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCorsHeaders({
      'Content-Type': 'application/json',
      ...headers,
    }),
  });
}
