export const SESSION_EXPIRED_ERROR = 'SESSION_EXPIRED';

// Refresh the access token when it expires within this many seconds. getSession()
// returns the stored token WITHOUT validating expiry, so a backgrounded tab (where
// supabase-js auto-refresh is paused) can hand an edge function a just-expired JWT,
// which its in-function auth.getUser() rejects with 401. The skew also covers clock
// drift + in-flight request latency.
const TOKEN_EXPIRY_SKEW_SECONDS = 60;

interface SessionLike {
  access_token: string;
  // Unix seconds. Absent on hand-built sessions (treated as non-expiring).
  expires_at?: number;
}

interface SessionResult {
  data: { session: SessionLike | null };
  error: Error | null;
}

interface InvokeResult {
  data: unknown;
  error: unknown;
}

interface AuthedFunctionsClient {
  auth: {
    getSession: () => Promise<SessionResult>;
    refreshSession: () => Promise<SessionResult>;
    signOut?: () => Promise<unknown>;
  };
  functions: {
    invoke: (functionName: string, options?: Record<string, unknown>) => Promise<InvokeResult>;
  };
}

interface InvokeAuthedFunctionOptions {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  region?: string;
  signal?: AbortSignal;
}

function isExpiringSoon(session: SessionLike): boolean {
  if (typeof session.expires_at !== 'number') return false;
  const nowSeconds = Date.now() / 1000;
  return session.expires_at <= nowSeconds + TOKEN_EXPIRY_SKEW_SECONDS;
}

// supabase-js surfaces a non-2xx edge response as a FunctionsHttpError whose
// `context` is the raw Response. A 401 there means the function rejected our
// bearer (expired/invalid JWT) before doing any work.
function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const context = (error as { context?: unknown }).context;
  if (!context || typeof context !== 'object') return false;
  return (context as { status?: unknown }).status === 401;
}

async function refreshOrThrow(client: AuthedFunctionsClient): Promise<string> {
  const { data, error } = await client.auth.refreshSession();
  if (error || !data.session?.access_token) {
    await client.auth.signOut?.();
    throw new Error(SESSION_EXPIRED_ERROR);
  }
  return data.session.access_token;
}

async function resolveAccessToken(client: AuthedFunctionsClient): Promise<string> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }

  const session = sessionData.session;
  // Only reuse the cached token if it exists AND is not about to expire.
  if (session?.access_token && !isExpiringSoon(session)) {
    return session.access_token;
  }

  return refreshOrThrow(client);
}

function withAuth(options: InvokeAuthedFunctionOptions, accessToken: string) {
  return {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

export async function invokeAuthedFunction<TData = unknown>(
  client: AuthedFunctionsClient,
  functionName: string,
  options: InvokeAuthedFunctionOptions = {}
) {
  const accessToken = await resolveAccessToken(client);
  const first = await client.functions.invoke(functionName, withAuth(options, accessToken));

  // Retry-once on 401: the edge function deemed our token expired even though
  // getSession() handed it over (a refresh race around token rotation). A 401
  // means the function did nothing (auth is its first gate), so re-invoking with
  // a force-refreshed token is safe — even for non-idempotent functions.
  if (isUnauthorizedError(first.error)) {
    const refreshedToken = await refreshOrThrow(client);
    const retried = await client.functions.invoke(functionName, withAuth(options, refreshedToken));
    return retried as { data: TData | null; error: unknown };
  }

  return first as { data: TData | null; error: unknown };
}
