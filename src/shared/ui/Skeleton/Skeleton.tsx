import type { CSSProperties } from 'react';

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

const roundedMap = { sm: '6px', md: '10px', lg: '16px', full: '9999px' };

export const Skeleton = ({
  className = '',
  style,
  width,
  height,
  rounded = 'md',
}: SkeletonProps) => (
  <>
    <style>{`
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
    `}</style>
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius: roundedMap[rounded],
        background:
          'linear-gradient(90deg, var(--color-bg-elevated) 25%, var(--color-bg-surface) 50%, var(--color-bg-elevated) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        ...style,
      }}
    />
  </>
);
