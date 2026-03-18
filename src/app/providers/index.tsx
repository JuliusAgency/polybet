import { type ReactNode } from 'react';
import { QueryProvider } from './QueryProvider';
import { AuthProvider } from './AuthProvider';
import { RTLProvider } from './RTLProvider';

interface AppProvidersProps {
    children: ReactNode;
}

export const AppProviders = ({ children }: AppProvidersProps) => {
    return (
        <QueryProvider>
            <AuthProvider>
                <RTLProvider>{children}</RTLProvider>
            </AuthProvider>
        </QueryProvider>
    );
};

export { AuthProvider } from './AuthProvider';
export { QueryProvider } from './QueryProvider';
export { RTLProvider } from './RTLProvider';
