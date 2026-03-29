import { useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { Profile, Role, SignInCredentials } from '../../../shared/types';
import { AuthContext, type AuthContextValue } from './AuthContext';

interface AuthProviderProps {
    children: ReactNode;
}

type SupabaseClientLike = {
    from: (...args: any[]) => any;
    auth: {
        getSession: (...args: any[]) => Promise<any>;
        onAuthStateChange: (...args: any[]) => any;
        signInWithPassword: (...args: any[]) => Promise<any>;
        signOut: (...args: any[]) => Promise<{ error?: { message?: string } | null } | void>;
        getUser: (...args: any[]) => Promise<any>;
    };
    channel: (...args: any[]) => any;
    removeChannel: (...args: any[]) => Promise<unknown> | unknown;
};

interface LoadedProfileHandlers {
    forceSignOut: () => Promise<void>;
    setProfile: (profile: Profile | null) => void;
    setRole: (role: Role | null) => void;
}

interface BootstrapAuthHandlers extends LoadedProfileHandlers {
    setSession: (session: AuthContextValue['session']) => void;
    setUser: (user: AuthContextValue['user']) => void;
    setLoading: (loading: boolean) => void;
    resetForceSignOut: () => void;
}

interface ForceSignOutController {
    forceSignOut: () => Promise<void>;
    resetForceSignOut: () => void;
}

interface SignOutResponse {
    error?: { message?: string } | null;
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

export const createForceSignOut = (signOut: () => Promise<SignOutResponse | void>): ForceSignOutController => {
    let hasForcedSignOut = false;
    let signOutInFlight = false;

    const forceSignOut = async () => {
        if (hasForcedSignOut || signOutInFlight) {
            return;
        }

        signOutInFlight = true;

        try {
            const response = await signOut();
            if (response && response.error) {
                console.error('[Auth] Failed to force sign out:', response.error);
                return;
            }

            hasForcedSignOut = true;
        } catch (error) {
            console.error('[Auth] Failed to force sign out:', error);
        } finally {
            signOutInFlight = false;
        }
    };

    const resetForceSignOut = () => {
        hasForcedSignOut = false;
        signOutInFlight = false;
    };

    return { forceSignOut, resetForceSignOut };
};

export const loadProfileFromSupabase = async (
    client: Pick<SupabaseClientLike, 'from'>,
    userId: string,
    handlers: LoadedProfileHandlers
) => {
    try {
        const { data, error } = await client
            .from('profiles')
            .select('id, username, full_name, role, phone, notes, is_active, created_by, created_at')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('[Auth] Failed to load profile:', error);
            handlers.setProfile(null);
            handlers.setRole(null);
            return;
        }

        if (!data) {
            return;
        }

        if (data.is_active === false) {
            await handlers.forceSignOut();
            return;
        }

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
        handlers.setProfile(profile);
        handlers.setRole(profile.role);
    } catch (error) {
        console.error('[Auth] Unexpected error loading profile:', error);
        handlers.setProfile(null);
        handlers.setRole(null);
    }
};

export const bootstrapAuthState = async (
    client: Pick<SupabaseClientLike, 'auth' | 'from'>,
    handlers: BootstrapAuthHandlers
) => {
    try {
        const {
            data: { session: currentSession },
        } = await client.auth.getSession();

        handlers.setSession(currentSession);
        handlers.setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
            handlers.resetForceSignOut();
            await loadProfileFromSupabase(client, currentSession.user.id, handlers);
        }
    } catch (error) {
        console.error('[Auth] Failed to get initial session:', error);
    } finally {
        handlers.setLoading(false);
    }
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<AuthContextValue['user']>(null);
    const [session, setSession] = useState<AuthContextValue['session']>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [role, setRole] = useState<Role | null>(null);
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

        let channel: unknown;
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
