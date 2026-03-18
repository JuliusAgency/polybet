import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/hooks/useAuth';
import type { Role, SignInCredentials } from '@/shared/types';

const ROLE_ROUTES: Record<Role, string> = {
    super_admin: '/admin/dashboard',
    manager: '/manager/users',
    user: '/markets',
};

interface UseSignInResult {
    signIn: (credentials: SignInCredentials) => Promise<void>;
    isPending: boolean;
    error: string | null;
}

export const useSignIn = (): UseSignInResult => {
    const { signIn: authSignIn, role } = useAuth();
    const navigate = useNavigate();
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [awaitingRole, setAwaitingRole] = useState(false);

    // Navigate once the role is populated after a successful sign-in
    useEffect(() => {
        if (awaitingRole && role !== null) {
            setAwaitingRole(false);
            navigate(ROLE_ROUTES[role], { replace: true });
        }
    }, [awaitingRole, role, navigate]);

    const signIn = useCallback(async (credentials: SignInCredentials): Promise<void> => {
        setIsPending(true);
        setError(null);

        try {
            await authSignIn(credentials);
            // Role loads asynchronously; the effect above handles navigation once it's ready
            setAwaitingRole(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            setError(message);
        } finally {
            setIsPending(false);
        }
    }, [authSignIn]);

    return { signIn, isPending, error };
};
