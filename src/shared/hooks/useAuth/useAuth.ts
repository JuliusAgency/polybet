import { useContext } from 'react';
import { AuthContext } from '@/app/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '@/app/providers/AuthProvider';

/**
 * Hook to access the current authentication state and helpers.
 * Must be used within an `<AuthProvider>`.
 */
export const useAuth = (): AuthContextValue => {
    const context = useContext(AuthContext);

    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }

    return context;
};
