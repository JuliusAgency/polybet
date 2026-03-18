import { forwardRef, useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...rest }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {label}
          </label>
        )}

        <input
          ref={ref}
          id={inputId}
          dir="auto"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          className={[
            'w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors',
            'placeholder:text-[var(--color-text-muted)]',
            'focus:ring-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error
              ? 'border-[var(--color-error)] focus:ring-[var(--color-error)]/30'
              : 'border-[var(--color-border)] focus:border-[var(--color-input-border-focus)] focus:ring-[var(--color-focus-ring)]',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            backgroundColor: 'var(--color-input-bg)',
            color: 'var(--color-text-primary)',
          }}
          {...rest}
        />

        {error && (
          <span
            id={errorId}
            role="alert"
            className="text-xs"
            style={{ color: 'var(--color-error)' }}
          >
            {error}
          </span>
        )}

        {!error && hint && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {hint}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
