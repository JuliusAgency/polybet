interface ProgressBarProps {
  value: number;
}

export const ProgressBar = ({ value }: ProgressBarProps) => {
  return (
    <div
      className="h-3 overflow-hidden rounded-full"
      style={{ backgroundColor: 'var(--color-bg-surface)' }}
      aria-hidden="true"
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${value}%`,
          background:
            'linear-gradient(90deg, var(--color-accent) 0%, color-mix(in srgb, var(--color-accent) 78%, white) 100%)',
        }}
      />
    </div>
  );
};
