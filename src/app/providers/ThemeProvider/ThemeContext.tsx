import { createContext } from 'react';
import type { ThemeName } from '@/shared/theme';

export interface ThemeContextValue {
    theme: ThemeName;
    setTheme: (next: ThemeName) => void;
    toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
