import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: reloadSpy },
    });
    // React logs caught render errors to console.error — silence the noise.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-reloads once on a stale-chunk error and renders nothing meanwhile', () => {
    render(
      <ErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: /assets/index-CaC4Pp7v.js" />
      </ErrorBoundary>
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('shows the manual Reload fallback when the loop guard has already tripped', () => {
    // Pretend a reload was just attempted so attemptChunkReload returns false.
    window.sessionStorage.setItem('polybet-chunk-reload-at', String(Date.now()));

    render(
      <ErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: /assets/index-CaC4Pp7v.js" />
      </ErrorBoundary>
    );

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('renders the generic error UI for non-chunk errors without reloading', () => {
    render(
      <ErrorBoundary>
        <Boom message="Insufficient balance" />
      </ErrorBoundary>
    );

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();
  });
});
