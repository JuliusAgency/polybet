import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/shared/ui/Input';
import { useSignIn } from './useSignIn';

export const SignInForm = () => {
    const { t } = useTranslation();
    const { signIn, isPending, error } = useSignIn();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        await signIn({ username, password });
    };

    return (
        <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
                <Input
                    id="username"
                    type="text"
                    label={t('signIn.username')}
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isPending}
                />
            </div>

            <div className="mb-6">
                <Input
                    id="password"
                    type="password"
                    label={t('signIn.password')}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isPending}
                />
            </div>

            {error !== null && (
                <p role="alert" className="mb-4 text-sm" style={{ color: 'var(--color-loss)' }}>
                    {error === 'ACCOUNT_BLOCKED'
                        ? t('signIn.errorBlocked')
                        : t('signIn.errorInvalid')}
                </p>
            )}

            <button
                type="submit"
                disabled={isPending}
                className="w-full py-2 px-4 rounded-md font-semibold transition-opacity disabled:opacity-60"
                style={{
                    backgroundColor: 'var(--color-accent)',
                    color: '#ffffff',
                }}
            >
                {isPending ? t('signIn.submitting') : t('signIn.submit')}
            </button>
        </form>
    );
};
