import type { ReactNode } from 'react';

type BadgeVariant = 'win' | 'loss' | 'pending' | 'open' | 'default';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const VARIANT_COLORS: Record<BadgeVariant, { color: string; bg: string }> = {
  win: { color: 'var(--color-win)', bg: 'var(--color-win-muted)' },
  loss: { color: 'var(--color-loss)', bg: 'var(--color-loss-muted)' },
  pending: { color: 'var(--color-pending)', bg: 'var(--color-pending-muted)' },
  open: { color: 'var(--color-open)', bg: 'var(--color-open-muted)' },
  default: { color: 'var(--color-text-secondary)', bg: 'rgba(148, 163, 184, 0.10)' },
};

export const Badge = ({ variant = 'default', children, className = '' }: BadgeProps) => {
  const { color, bg } = VARIANT_COLORS[variant];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={{ color, backgroundColor: bg }}
    >
      {children}
    </span>
  );
};
