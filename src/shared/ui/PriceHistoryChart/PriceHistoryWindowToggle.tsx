import { PRICE_HISTORY_WINDOWS, type PriceHistoryWindow } from '@/features/bet';

interface PriceHistoryWindowToggleProps {
  value: PriceHistoryWindow;
  onChange: (value: PriceHistoryWindow) => void;
  disabled?: boolean;
}

export const PriceHistoryWindowToggle = ({
  value,
  onChange,
  disabled = false,
}: PriceHistoryWindowToggleProps) => {
  return (
    <div
      role="radiogroup"
      className="inline-flex items-center gap-1 rounded-full p-0.5"
      style={{
        backgroundColor: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
      }}
    >
      {PRICE_HISTORY_WINDOWS.map((w) => {
        const active = w === value;
        return (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(w)}
            className="rounded-full px-2.5 py-1 font-mono text-[11px] font-medium uppercase transition-colors disabled:opacity-40"
            style={{
              backgroundColor: active ? 'var(--color-accent)' : 'transparent',
              color: active ? 'oklch(100% 0 0)' : 'var(--color-text-secondary)',
              transitionDuration: 'var(--duration-fast)',
              transitionTimingFunction: 'var(--ease-out-expo)',
            }}
          >
            {w}
          </button>
        );
      })}
    </div>
  );
};
