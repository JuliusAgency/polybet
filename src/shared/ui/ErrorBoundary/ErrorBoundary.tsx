import { Component, type ReactNode } from 'react';
import { attemptChunkReload, isDynamicImportError } from '@/shared/utils';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  /** A stale-chunk reload is in flight — render nothing while the page navigates. */
  isReloading: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, isReloading: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, isReloading: false };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    // Stale chunk after a deploy: try a one-shot reload to pull fresh assets.
    // attemptChunkReload returns false if it already reloaded recently (loop
    // guard) — then we fall through to the manual-reload fallback UI below.
    if (isDynamicImportError(error) && attemptChunkReload()) {
      this.setState({ isReloading: true });
      return;
    }

    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.isReloading) {
      return null;
    }

    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isChunkError = isDynamicImportError(this.state.error);

      return (
        <div
          className="flex min-h-[200px] flex-col items-center justify-center gap-2 p-8 text-center"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <p className="text-base font-medium" style={{ color: 'var(--color-error)' }}>
            Something went wrong
          </p>
          {this.state.error && (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {this.state.error.message}
            </p>
          )}
          {isChunkError && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 rounded-md px-4 py-2 text-sm font-medium"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-contrast)',
              }}
            >
              Reload
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
