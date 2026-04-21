import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { THEME_DEFAULT, THEME_STORAGE_KEY, type ThemeName } from '@/shared/theme';
import { ThemeContext, type ThemeContextValue } from './ThemeContext';

interface ThemeProviderProps {
    children: ReactNode;
}

const isThemeName = (value: unknown): value is ThemeName =>
    value === 'dark' || value === 'light';

const readStoredTheme = (): ThemeName => {
    if (typeof window === 'undefined') {
        return THEME_DEFAULT;
    }
    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (isThemeName(stored)) {
            return stored;
        }
    } catch {
        // localStorage can throw in private mode / sandboxed iframes — ignore.
    }
    return THEME_DEFAULT;
};

const applyThemeToDocument = (theme: ThemeName) => {
    const root = document.documentElement;
    if (theme === 'light') {
        root.setAttribute('data-theme', 'light');
    } else {
        root.removeAttribute('data-theme');
    }
};

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
    const [theme, setThemeState] = useState<ThemeName>(readStoredTheme);

    useEffect(() => {
        applyThemeToDocument(theme);
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch {
            // ignore persistence failures — theme still applied for the session.
        }
    }, [theme]);

    const setTheme = useCallback((next: ThemeName) => {
        setThemeState(next);
    }, []);

    const toggleTheme = useCallback(() => {
        setThemeState((current) => (current === 'dark' ? 'light' : 'dark'));
    }, []);

    const value = useMemo<ThemeContextValue>(
        () => ({ theme, setTheme, toggleTheme }),
        [theme, setTheme, toggleTheme]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
