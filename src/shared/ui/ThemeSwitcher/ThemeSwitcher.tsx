import { useTranslation } from 'react-i18next';
import { useTheme } from '@/shared/hooks/useTheme';

const ICON_SIZE = 18;

const SunIcon = () => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
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
    width={ICON_SIZE}
    height={ICON_SIZE}
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

export const ThemeSwitcher = () => {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const isLight = theme === 'light';
  const nextLabel = isLight ? t('theme.switchToDark') : t('theme.switchToLight');

  return (
    <>
      <style>{`
                .theme-switcher {
                    position: relative;
                    inline-size: 34px;
                    block-size: 34px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    background-color: transparent;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-full);
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    overflow: hidden;
                    transition:
                        background-color var(--duration-base) var(--ease-out-expo),
                        color var(--duration-base) var(--ease-out-expo),
                        border-color var(--duration-base) var(--ease-out-expo);
                }
                .theme-switcher:hover {
                    color: var(--color-text-primary);
                    background-color: var(--color-hover);
                    border-color: var(--color-border-strong);
                }
                .theme-switcher:focus-visible {
                    outline: none;
                    box-shadow: 0 0 0 3px var(--color-focus-ring);
                }

                .theme-switcher__icon {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition:
                        opacity 260ms var(--ease-out-expo),
                        transform 320ms var(--ease-out-expo);
                    will-change: opacity, transform;
                }

                /* Dark theme: show moon, hide sun */
                .theme-switcher[data-state='dark'] .theme-switcher__icon--sun {
                    opacity: 0;
                    transform: rotate(-90deg) scale(0.5);
                }
                .theme-switcher[data-state='dark'] .theme-switcher__icon--moon {
                    opacity: 1;
                    transform: rotate(0deg) scale(1);
                }

                /* Light theme: show sun, hide moon */
                .theme-switcher[data-state='light'] .theme-switcher__icon--sun {
                    opacity: 1;
                    transform: rotate(0deg) scale(1);
                }
                .theme-switcher[data-state='light'] .theme-switcher__icon--moon {
                    opacity: 0;
                    transform: rotate(90deg) scale(0.5);
                }

                @media (prefers-reduced-motion: reduce) {
                    .theme-switcher__icon {
                        transition-duration: 1ms;
                    }
                }
            `}</style>
      <button
        type="button"
        onClick={toggleTheme}
        className="theme-switcher"
        data-state={theme}
        aria-label={nextLabel}
        title={nextLabel}
      >
        <span className="theme-switcher__icon theme-switcher__icon--sun">
          <SunIcon />
        </span>
        <span className="theme-switcher__icon theme-switcher__icon--moon">
          <MoonIcon />
        </span>
      </button>
    </>
  );
};
