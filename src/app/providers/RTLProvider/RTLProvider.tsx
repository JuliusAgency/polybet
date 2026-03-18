import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface RTLProviderProps {
    children: ReactNode;
}

export const RTLProvider = ({ children }: RTLProviderProps) => {
    const { i18n } = useTranslation();

    useEffect(() => {
        const lang = i18n.language;
        const dir = lang === 'he' ? 'rtl' : 'ltr';
        const resolvedLang = lang === 'he' ? 'he' : 'en';

        document.documentElement.dir = dir;
        document.documentElement.lang = resolvedLang;
    }, [i18n.language]);

    return <>{children}</>;
};
