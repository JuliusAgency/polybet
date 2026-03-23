export const SESSION_EXPIRED_ERROR = 'SESSION_EXPIRED';

interface SessionLike {
  access_token: string;
}

interface SessionResult {
  data: { session: SessionLike | null };
  error: Error | null;
}

interface AuthedFunctionsClient {
  auth: {
    getSession: () => Promise<SessionResult>;
    refreshSession: () => Promise<SessionResult>;
    signOut?: () => Promise<unknown>;
  };
  functions: {
    invoke: (
      functionName: string,
      options?: Record<string, unknown>
    ) => Promise<{ data: unknown; error: unknown }>;
  };
}

interface InvokeAuthedFunctionOptions {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  region?: string;
  signal?: AbortSignal;
}

async function resolveAccessToken(client: AuthedFunctionsClient): Promise<string> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }

  if (sessionData.session?.access_token) {
    return sessionData.session.access_token;
  }

  const { data: refreshedData, error: refreshError } = await client.auth.refreshSession();
  if (refreshError || !refreshedData.session?.access_token) {
    await client.auth.signOut?.();
    throw new Error(SESSION_EXPIRED_ERROR);
  }

  return refreshedData.session.access_token;
}

export async function invokeAuthedFunction<TData = unknown>(
  client: AuthedFunctionsClient,
  functionName: string,
  options: InvokeAuthedFunctionOptions = {}
) {
  const accessToken = await resolveAccessToken(client);

  return client.functions.invoke(functionName, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  }) as Promise<{ data: TData | null; error: unknown }>;
}
