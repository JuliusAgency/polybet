import { useTranslation } from 'react-i18next';

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const current = i18n.language;

  return (
    <div className="flex rounded-md overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
      {(['en', 'he'] as const).map((lang) => (
        <button
          key={lang}
          onClick={() => i18n.changeLanguage(lang)}
          className="px-2 py-1 text-xs font-medium uppercase transition-colors"
          style={{
            backgroundColor: current === lang ? 'var(--color-accent)' : 'transparent',
            color: current === lang ? '#fff' : 'var(--color-text-secondary)',
          }}
        >
          {lang}
        </button>
      ))}
    </div>
  );
};
