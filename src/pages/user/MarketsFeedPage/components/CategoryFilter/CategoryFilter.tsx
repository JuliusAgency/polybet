import { useTranslation } from 'react-i18next';

interface CategoryFilterProps {
  value: string | null;
  onChange: (value: string | null) => void;
  categories: string[];
}

export function CategoryFilter({ value, onChange, categories }: CategoryFilterProps) {
  const { t } = useTranslation();

  if (categories.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <button
        onClick={() => onChange(null)}
        className="rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
        style={{
          backgroundColor:
            value === null
              ? 'var(--color-accent)'
              : 'color-mix(in srgb, var(--color-accent) 3%, var(--color-bg-elevated))',
          color:
            value === null
              ? 'var(--color-bg-base)'
              : 'color-mix(in srgb, var(--color-accent) 25%, var(--color-text-secondary))',
          border: `1px solid ${value === null ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-accent) 12%, var(--color-border))'}`,
        }}
      >
        {t('markets.categoryAll')}
      </button>
      {categories.map((cat) => {
        const isActive = value === cat;
        return (
          <button
            key={cat}
            onClick={() => onChange(isActive ? null : cat)}
            className="rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: isActive
                ? 'var(--color-accent)'
                : 'color-mix(in srgb, var(--color-accent) 3%, var(--color-bg-elevated))',
              color: isActive
                ? 'var(--color-bg-base)'
                : 'color-mix(in srgb, var(--color-accent) 25%, var(--color-text-secondary))',
              border: `1px solid ${isActive ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-accent) 12%, var(--color-border))'}`,
            }}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
