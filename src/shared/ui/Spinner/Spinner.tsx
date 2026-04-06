interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Spinner = ({ size = 'md', className = '' }: SpinnerProps) => {
  const sizeMap = { sm: 16, md: 24, lg: 40 };
  const px = sizeMap[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ animation: 'spin 0.8s linear infinite' }}
      aria-label="Loading"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="var(--color-bg-elevated)" strokeWidth="3" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="var(--color-accent)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
};
