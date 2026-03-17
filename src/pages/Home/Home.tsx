import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { HOME_PAGE_ID } from './const';

export const Home = () => {
    const { t, i18n } = useTranslation();

    const toggleLanguage = () => {
        const nextLang = i18n.language === 'en' ? 'he' : 'en';
        i18n.changeLanguage(nextLang);
    };

    const isRtl = i18n.language === 'he';

    return (
        <main
            id={HOME_PAGE_ID}
            dir={isRtl ? 'rtl' : 'ltr'}
            className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white"
        >
            <div className="mx-auto max-w-lg text-center">
                <h1 className="mb-4 text-5xl font-bold tracking-tight">{t('app.title')}</h1>
                <p className="mb-8 text-lg text-slate-300">{t('app.welcome')}</p>

                <Button variant="secondary" onClick={toggleLanguage}>
                    {t('common.language')}: {i18n.language.toUpperCase()}
                </Button>
            </div>
        </main>
    );
};
