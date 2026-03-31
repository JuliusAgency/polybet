import { useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { SignInCredentials } from '../../../shared/types';
import { AuthContext, type AuthContextValue } from './AuthContext';
import {
    type SupabaseClientLike,
    createForceSignOut,
    loadProfileFromSupabase,
    bootstrapAuthState,
} from './authHelpers';

interface AuthProviderProps {
    children: ReactNode;
}

let supabasePromise: Promise<SupabaseClientLike> | null = null;

const getSupabase = async (): Promise<SupabaseClientLike> => {
    if (!supabasePromise) {
        supabasePromise = import('../../../shared/api/supabase/client.ts').then(
            (module) => module.supabase as SupabaseClientLike
        );
    }

    return supabasePromise;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<AuthContextValue['user']>(null);
    const [session, setSession] = useState<AuthContextValue['session']>(null);
    const [profile, setProfile] = useState<AuthContextValue['profile']>(null);
    const [role, setRole] = useState<AuthContextValue['role']>(null);
    const [loading, setLoading] = useState(true);

    const { forceSignOut, resetForceSignOut } = useMemo(
        () =>
            createForceSignOut(async () => {
                const supabase = await getSupabase();
                return supabase.auth.signOut();
            }),
        []
    );

    const loadProfile = useCallback(
        async (userId: string) => {
            const supabase = await getSupabase();
            await loadProfileFromSupabase(supabase, userId, {
                forceSignOut,
                setProfile,
                setRole,
            });
        },
        [forceSignOut]
    );

    useEffect(() => {
        void (async () => {
            const supabase = await getSupabase();
            await bootstrapAuthState(supabase, {
                forceSignOut,
                resetForceSignOut,
                setLoading,
                setProfile,
                setRole,
                setSession,
                setUser,
            });
        })();
    }, [forceSignOut, resetForceSignOut]);

    // Force-logout when is_active is set to false while user is in session
    useEffect(() => {
        if (!user) return;

        let channel: RealtimeChannel | undefined;
        let active = true;

        void (async () => {
            const supabase = await getSupabase();
            if (!active) return;

            channel = supabase
                .channel(`profile-block-${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'profiles',
                        filter: `id=eq.${user.id}`,
                    },
                    (payload: { new: { is_active: boolean } }) => {
                        const updated = payload.new as { is_active: boolean };
                        if (updated.is_active === false) {
                            void forceSignOut();
                        }
                    },
                )
                .subscribe();
        })();

        return () => {
            active = false;
            if (channel) {
                void (async () => {
                    const supabase = await getSupabase();
                    await supabase.removeChannel(channel);
                })();
            }
        };
    }, [forceSignOut, user]);

    useEffect(() => {
        let active = true;
        let subscription: { unsubscribe: () => void } | null = null;

        void (async () => {
            const supabase = await getSupabase();
            if (!active) return;

            const {
                data: { subscription: authSubscription },
            } = supabase.auth.onAuthStateChange((_event: string, newSession: AuthContextValue['session']) => {
                setSession(newSession);
                setUser(newSession?.user ?? null);

                if (newSession?.user) {
                    resetForceSignOut();
                    loadProfile(newSession.user.id).finally(() => setLoading(false));
                } else {
                    resetForceSignOut();
                    setProfile(null);
                    setRole(null);
                    setLoading(false);
                }
            });

            subscription = authSubscription;
        })();

        return () => {
            active = false;
            subscription?.unsubscribe();
        };
    }, [loadProfile, resetForceSignOut]);

    const signIn = useCallback(async ({ username, password }: SignInCredentials) => {
        const email = `${username}@polybet.internal`;
        const supabase = await getSupabase();
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Check is_active immediately after successful auth
        const {
            data: { user: currentUser },
        } = await supabase.auth.getUser();
        if (currentUser) {
            const { data: profileData } = await supabase
                .from('profiles')
                .select('is_active')
                .eq('id', currentUser.id)
                .single();
            if (profileData?.is_active === false) {
                await forceSignOut();
                throw new Error('ACCOUNT_BLOCKED');
            }
        }
    }, [forceSignOut]);

    const signOut = useCallback(async () => {
        resetForceSignOut();
        const supabase = await getSupabase();
        await supabase.auth.signOut();
    }, [resetForceSignOut]);

    const value = useMemo<AuthContextValue>(
        () => ({ user, session, profile, role, loading, signIn, signOut }),
        [user, session, profile, role, loading, signIn, signOut]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
