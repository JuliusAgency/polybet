import { useTranslation } from 'react-i18next';

export type WorldCupTab = 'games' | 'props' | 'map';

export interface WorldCupSubTabsProps {
  value: WorldCupTab;
  onChange: (value: WorldCupTab) => void;
}

// Order is fixed by product: Games, Props, Map. Mirrors the StatusFilter pill
// pattern (src/widgets/StatusFilter) so the segmented control looks consistent.
const OPTIONS: { key: WorldCupTab; i18nKey: string }[] = [
  { key: 'games', i18nKey: 'worldCup.tabGames' },
  { key: 'props', i18nKey: 'worldCup.tabProps' },
  { key: 'map', i18nKey: 'worldCup.tabMap' },
];

export function WorldCupSubTabs({ value, onChange }: WorldCupSubTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {OPTIONS.map((opt) => {
        const isActive = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
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
