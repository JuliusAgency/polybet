import { useContext } from 'react';
import { ThemeContext, type ThemeContextValue } from '@/app/providers/ThemeProvider';

/**
 * Hook to read the current theme and mutate it.
 * Must be used inside a `<ThemeProvider>`.
 */
export const useTheme = (): ThemeContextValue => {
    const context = useContext(ThemeContext);

    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }

    return context;
};
