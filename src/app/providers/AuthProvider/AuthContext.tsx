import { createContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { Profile, Role, SignInCredentials } from '@/shared/types';

export interface AuthContextValue {
    user: User | null;
    session: Session | null;
    profile: Profile | null;
    role: Role | null;
    loading: boolean;
    signIn: (credentials: SignInCredentials) => Promise<void>;
    signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
