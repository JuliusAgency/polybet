/**
 * Recovery helpers for the Vite stale-chunk problem.
 *
 * After a new deploy, Vite's content-hashed chunk filenames change and the old
 * files are removed from the CDN. A client still holding the previous index.html
 * then fails to lazy-import a chunk that no longer exists, throwing
 * "Failed to fetch dynamically imported module". The fix is to reload the page
 * once so the fresh index.html + new chunk names are fetched.
 */

/** sessionStorage key holding the timestamp of the last auto-reload attempt. */
const RELOAD_GUARD_KEY = 'polybet-chunk-reload-at';

/**
 * Window inside which a second reload is suppressed. Long enough to cover the
 * navigation + boot of the reloaded page, short enough that a genuine stale
 * chunk encountered later in the same session can still trigger a fresh reload.
 */
const RELOAD_GUARD_WINDOW_MS = 10_000;

const CHUNK_ERROR_SIGNATURES = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed', // Safari
  'error loading dynamically imported module',
  'ChunkLoadError',
] as const;

/**
 * True when the error looks like a failed dynamic import / stale chunk rather
 * than a genuine application error.
 */
export const isDynamicImportError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (!message) {
    return false;
  }

  return CHUNK_ERROR_SIGNATURES.some((signature) => message.includes(signature));
};

const readLastReloadAt = (): number => {
  try {
    const raw = window.sessionStorage.getItem(RELOAD_GUARD_KEY);
    const value = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(value) ? value : 0;
  } catch {
    // sessionStorage can throw in private mode / sandboxed frames.
    return 0;
  }
};

const writeLastReloadAt = (timestamp: number): void => {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(timestamp));
  } catch {
    // Ignore — worst case we lose the loop guard for this attempt.
  }
};

/**
 * Loop-guarded one-shot page reload for stale-chunk recovery.
 *
 * Returns `true` if a reload was triggered (caller should expect navigation),
 * or `false` if a reload was already attempted within RELOAD_GUARD_WINDOW_MS —
 * in which case the caller should surface a manual fallback instead of looping
 * forever (e.g. the chunk is genuinely unreachable because the client is
 * offline).
 */
export const attemptChunkReload = (): boolean => {
  const now = Date.now();
  const lastReloadAt = readLastReloadAt();

  if (lastReloadAt && now - lastReloadAt < RELOAD_GUARD_WINDOW_MS) {
    return false;
  }

  writeLastReloadAt(now);
  window.location.reload();
  return true;
};
