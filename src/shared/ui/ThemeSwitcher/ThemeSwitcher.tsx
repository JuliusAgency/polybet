import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/shared/hooks/useTheme';
import type { ThemeName } from '@/shared/theme';

const SunIcon = () => (
    <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
);

const MoonIcon = () => (
    <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
);

const ICONS: Record<ThemeName, ReactElement> = {
    light: <SunIcon />,
    dark: <MoonIcon />,
};

export const ThemeSwitcher = () => {
    const { t } = useTranslation();
    const { theme, setTheme } = useTheme();

    const options: Array<{ value: ThemeName; label: string }> = [
        { value: 'dark', label: t('theme.dark') },
        { value: 'light', label: t('theme.light') },
    ];

    return (
        <div
            role="group"
            aria-label={t('theme.label')}
            className="flex overflow-hidden border"
            style={{
                borderColor: 'var(--color-border)',
                borderRadius: 'var(--radius-sm)',
            }}
        >
            {options.map((option) => {
                const active = option.value === theme;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => setTheme(option.value)}
                        aria-pressed={active}
                        aria-label={
                            option.value === 'dark'
                                ? t('theme.switchToDark')
                                : t('theme.switchToLight')
                        }
                        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium uppercase"
                        style={{
                            backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                            color: active
                                ? 'var(--color-accent-contrast)'
                                : 'var(--color-text-secondary)',
                            transition: `background-color var(--transition-fast), color var(--transition-fast)`,
                        }}
                    >
                        {ICONS[option.value]}
                        <span>{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
};
