import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, Role } from '../../../shared/types';
import type { AuthContextValue } from './AuthContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseClientLike = SupabaseClient<any, any, any>;

export interface LoadedProfileHandlers {
    forceSignOut: () => Promise<void>;
    setProfile: (profile: Profile | null) => void;
    setRole: (role: Role | null) => void;
}

export interface BootstrapAuthHandlers extends LoadedProfileHandlers {
    setSession: (session: AuthContextValue['session']) => void;
    setUser: (user: AuthContextValue['user']) => void;
    setLoading: (loading: boolean) => void;
    resetForceSignOut: () => void;
}

export interface ForceSignOutController {
    forceSignOut: () => Promise<void>;
    resetForceSignOut: () => void;
}

export interface SignOutResponse {
    error?: { message?: string } | null;
}

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
