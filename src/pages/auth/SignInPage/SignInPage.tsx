import { useTranslation } from 'react-i18next';
import { SignInForm } from '@/features/auth/sign-in';
import { LanguageSwitcher } from '@/shared/ui/LanguageSwitcher';
import { ThemeSwitcher } from '@/shared/ui/ThemeSwitcher';

const SignInPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-full items-center justify-center px-4 pt-[10vh] sm:py-12 sm:pt-0">
      <div
        className="w-full max-w-md rounded-xl p-6 sm:p-8"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <h1
          className="mb-2 text-center text-3xl font-bold"
          style={{ color: 'var(--color-accent)' }}
        >
          PolyBet
        </h1>
        <h2 className="mb-8 text-center text-lg" style={{ color: 'var(--color-text-primary)' }}>
          {t('signIn.title')}
        </h2>
        <SignInForm />
        <p className="mt-6 text-center text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          v{__APP_VERSION__}
        </p>
        {/* A7: theme + language switchers relocated to a slim centered footer. */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
