import { useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { supabase } from '@/api/supabase';
import { AuthContext, type AuthContextValue } from './AuthContext';

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<AuthContextValue['user']>(null);
    const [session, setSession] = useState<AuthContextValue['session']>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const getInitialSession = async () => {
            try {
                const {
                    data: { session: currentSession },
                } = await supabase.auth.getSession();

                setSession(currentSession);
                setUser(currentSession?.user ?? null);
            } catch (error) {
                console.error('[Auth] Failed to get initial session:', error);
            } finally {
                setLoading(false);
            }
        };

        getInitialSession();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession);
            setUser(newSession?.user ?? null);
            setLoading(false);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }, []);

    const signUp = useCallback(async (email: string, password: string) => {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
    }, []);

    const signOut = useCallback(async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({ user, session, loading, signIn, signUp, signOut }),
        [user, session, loading, signIn, signUp, signOut]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
