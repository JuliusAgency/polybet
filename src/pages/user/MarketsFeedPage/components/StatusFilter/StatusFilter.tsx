import { useTranslation } from 'react-i18next';
import type { MarketStatusFilter } from '@/features/bet';

interface StatusFilterProps {
  value: MarketStatusFilter;
  onChange: (value: MarketStatusFilter) => void;
}

const OPTIONS: { key: MarketStatusFilter; i18nKey: string }[] = [
  { key: 'open', i18nKey: 'markets.filterOpen' },
  { key: 'resolved', i18nKey: 'markets.filterResolved' },
  { key: 'closed', i18nKey: 'markets.filterClosed' },
  { key: 'all', i18nKey: 'markets.filterAll' },
  { key: 'archived', i18nKey: 'markets.filterArchived' },
];

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((opt) => {
        const isActive = value === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className="rounded-full px-3 py-1 text-sm font-medium transition-colors"
            style={{
              backgroundColor: isActive ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
              color: isActive ? 'var(--color-bg-base)' : 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            {t(opt.i18nKey)}
          </button>
        );
      })}
    </div>
  );
}
