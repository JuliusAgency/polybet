import { type ReactNode } from 'react';
import { QueryProvider } from './QueryProvider';
import { AuthProvider } from './AuthProvider';
import { RTLProvider } from './RTLProvider';
import { ThemeProvider } from './ThemeProvider';

interface AppProvidersProps {
    children: ReactNode;
}

export const AppProviders = ({ children }: AppProvidersProps) => {
    return (
        <ThemeProvider>
            <QueryProvider>
                <AuthProvider>
                    <RTLProvider>{children}</RTLProvider>
                </AuthProvider>
            </QueryProvider>
        </ThemeProvider>
    );
};

export { AuthProvider } from './AuthProvider';
export { QueryProvider } from './QueryProvider';
export { RTLProvider } from './RTLProvider';
export { ThemeProvider } from './ThemeProvider';
