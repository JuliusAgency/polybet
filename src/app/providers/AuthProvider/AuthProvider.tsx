import { useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { supabase } from '@/shared/api/supabase';
import type { Profile, Role, SignInCredentials } from '@/shared/types';
import { AuthContext, type AuthContextValue } from './AuthContext';

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<AuthContextValue['user']>(null);
    const [session, setSession] = useState<AuthContextValue['session']>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [role, setRole] = useState<Role | null>(null);
    const [loading, setLoading] = useState(true);

    const loadProfile = useCallback(async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, username, full_name, role, phone, notes, is_active, created_by, created_at')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('[Auth] Failed to load profile:', error);
                setProfile(null);
                setRole(null);
            } else if (data) {
                const profile: Profile = {
                    id: data.id,
                    username: data.username,
                    full_name: data.full_name,
                    role: data.role as Role,
                    phone: data.phone,
                    notes: data.notes,
                    is_active: data.is_active,
                    created_by: data.created_by,
                    created_at: data.created_at,
                };
                setProfile(profile);
                setRole(profile.role);
            }
        } catch (error) {
            console.error('[Auth] Unexpected error loading profile:', error);
            setProfile(null);
            setRole(null);
        }
    }, []);

    useEffect(() => {
        const getInitialSession = async () => {
            try {
                const {
                    data: { session: currentSession },
                } = await supabase.auth.getSession();

                setSession(currentSession);
                setUser(currentSession?.user ?? null);

                if (currentSession?.user) {
                    await loadProfile(currentSession.user.id);
                }
            } catch (error) {
                console.error('[Auth] Failed to get initial session:', error);
            } finally {
                setLoading(false);
            }
        };

        getInitialSession();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
            setSession(newSession);
            setUser(newSession?.user ?? null);

            if (newSession?.user) {
                await loadProfile(newSession.user.id);
            } else {
                setProfile(null);
                setRole(null);
            }

            setLoading(false);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [loadProfile]);

    const signIn = useCallback(async ({ username, password }: SignInCredentials) => {
        const email = `${username}@polybet.internal`;
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }, []);

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({ user, session, profile, role, loading, signIn, signOut }),
        [user, session, profile, role, loading, signIn, signOut]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
