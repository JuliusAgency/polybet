export const DEFAULT_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
