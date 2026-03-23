interface FetchJsonWithRetryOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxAttempts?: number;
  heartbeatMs?: number;
  onHeartbeat?: (context: { attempt: number }) => void;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_HEARTBEAT_MS = 5_000;

function delayForAttempt(attempt: number) {
  return Math.min(4_000, 500 * 2 ** (attempt - 1));
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

export async function fetchJsonWithRetry<T>(
  url: string,
  options: FetchJsonWithRetryOptions = {},
): Promise<T> {
  const {
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    heartbeatMs = DEFAULT_HEARTBEAT_MS,
    onHeartbeat,
    fetchImpl = fetch,
    sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const heartbeatId = setInterval(() => {
      onHeartbeat?.({ attempt });
    }, heartbeatMs);

    try {
      const response = await fetchImpl(url, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Gamma API error ${response.status}: ${await response.text()}`);
      }

      return await response.json() as T;
    } catch (error: unknown) {
      lastError = isAbortError(error)
        ? new Error(`Gamma API request timed out after ${timeoutMs}ms`)
        : error;

      if (attempt === maxAttempts) {
        break;
      }

      await sleep(delayForAttempt(attempt));
    } finally {
      clearTimeout(timeoutId);
      clearInterval(heartbeatId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
