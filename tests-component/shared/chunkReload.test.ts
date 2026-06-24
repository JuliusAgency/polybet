import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attemptChunkReload, isDynamicImportError } from '@/shared/utils';

describe('isDynamicImportError', () => {
  it('matches the known stale-chunk signatures', () => {
    const messages = [
      'Failed to fetch dynamically imported module: https://x/assets/index-CaC4Pp7v.js',
      'Importing a module script failed.',
      'error loading dynamically imported module',
      'ChunkLoadError: Loading chunk 5 failed',
    ];
    for (const message of messages) {
      expect(isDynamicImportError(new Error(message))).toBe(true);
    }
  });

  it('matches when given a raw string', () => {
    expect(isDynamicImportError('Failed to fetch dynamically imported module')).toBe(true);
  });

  it('returns false for unrelated application errors', () => {
    expect(isDynamicImportError(new Error('Insufficient balance'))).toBe(false);
    expect(isDynamicImportError(null)).toBe(false);
    expect(isDynamicImportError(undefined)).toBe(false);
    expect(isDynamicImportError({})).toBe(false);
  });
});

describe('attemptChunkReload', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: reloadSpy },
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reloads on the first call', () => {
    expect(attemptChunkReload()).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('does not reload again within the guard window (loop guard)', () => {
    expect(attemptChunkReload()).toBe(true);
    expect(attemptChunkReload()).toBe(false);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('reloads again once the guard window has elapsed', () => {
    expect(attemptChunkReload()).toBe(true);
    vi.advanceTimersByTime(11_000);
    expect(attemptChunkReload()).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(2);
  });
});
