interface ProgressBarProps {
  value: number;
  indeterminate?: boolean;
}

export const ProgressBar = ({ value, indeterminate = false }: ProgressBarProps) => {
  return (
    <div
      className="h-3 overflow-hidden rounded-full"
      style={{ backgroundColor: 'var(--color-bg-surface)' }}
      aria-hidden="true"
    >
      <div
        className={indeterminate
          ? 'h-full rounded-full animate-pulse'
          : 'h-full rounded-full transition-all duration-500'}
        style={{
          width: indeterminate ? '35%' : `${value}%`,
          background:
            'linear-gradient(90deg, var(--color-accent) 0%, color-mix(in srgb, var(--color-accent) 78%, white) 100%)',
        }}
      />
    </div>
  );
};
