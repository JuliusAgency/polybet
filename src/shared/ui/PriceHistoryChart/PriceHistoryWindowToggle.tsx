import { PRICE_HISTORY_WINDOWS, type PriceHistoryWindow } from '@/shared/types/priceHistory';

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
    <div role="radiogroup" className="inline-flex items-center gap-2 sm:gap-3">
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
            className="px-1 py-0.5 font-mono text-[11px] font-medium transition-colors disabled:opacity-40"
            style={{
              backgroundColor: 'transparent',
              color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontWeight: active ? 700 : 500,
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
