import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/hooks/useAuth';

interface UseSignOutResult {
    signOut: () => Promise<void>;
    isPending: boolean;
}

export const useSignOut = (): UseSignOutResult => {
    const { signOut: authSignOut } = useAuth();
    const navigate = useNavigate();
    const [isPending, setIsPending] = useState(false);

    const signOut = async (): Promise<void> => {
        setIsPending(true);
        try {
            await authSignOut();
            navigate('/sign-in', { replace: true });
        } catch (err) {
            console.error('[SignOut] Failed to sign out:', err);
        } finally {
            setIsPending(false);
        }
    };

    return { signOut, isPending };
};
