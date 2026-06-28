import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './ActionButton.css';

export type ActionTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
export type ActionSize = 'sm' | 'md';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Semantic intent — drives colour. Defaults to a quiet outline (neutral). */
  tone?: ActionTone;
  /** sm = compact row action (default); md = a standalone CTA. */
  size?: ActionSize;
  /** Leading icon; rendered decoratively (aria-hidden) before the label. */
  icon?: ReactNode;
  /** Stretch to fill the container (e.g. inside a mobile card action grid). */
  block?: boolean;
  children: ReactNode;
}

export const ActionButton = ({
  tone = 'neutral',
  size = 'sm',
  icon,
  block = false,
  type,
  className = '',
  children,
  ...rest
}: ActionButtonProps) => {
  const classes = [
    'action-btn',
    `action-btn--${tone}`,
    `action-btn--${size}`,
    block ? 'action-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    // Default to type="button" so a row action never accidentally submits a form.
    <button type={type ?? 'button'} className={classes} {...rest}>
      {icon && (
        <span className="action-btn__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
};
