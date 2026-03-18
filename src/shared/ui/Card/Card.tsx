import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}

const PADDING_CLASSES: Record<NonNullable<CardProps['padding']>, string> = {
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-8',
};

export const Card = ({ children, className = '', padding = 'md' }: CardProps) => {
  return (
    <div
      className={`border rounded-xl ${PADDING_CLASSES[padding]} ${className}`}
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        borderColor: 'var(--color-border)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {children}
    </div>
  );
};
