import { useTranslation } from 'react-i18next';
import { SignInForm } from '@/features/auth/sign-in';
import { LanguageSwitcher } from '@/shared/ui/LanguageSwitcher';

const SignInPage = () => {
    const { t } = useTranslation();

    return (
        <div className="flex items-center justify-center min-h-full py-12 px-4">
            <div
                className="w-full max-w-md rounded-xl p-8 shadow-md"
                style={{ backgroundColor: 'var(--color-bg-surface)' }}
            >
                    <div className="flex justify-end mb-4"><LanguageSwitcher /></div>
                <h1
                    className="text-3xl font-bold text-center mb-2"
                    style={{ color: 'var(--color-accent)' }}
                >
                    PolyBet
                </h1>
                <h2
                    className="text-lg text-center mb-8"
                    style={{ color: 'var(--color-text-primary)' }}
                >
                    {t('signIn.title')}
                </h2>
                <SignInForm />
                <p
                    className="mt-6 text-center text-xs"
                    style={{ color: 'var(--color-text-secondary)' }}
                >
                    v{__APP_VERSION__}
                </p>
            </div>
        </div>
    );
};

export default SignInPage;
