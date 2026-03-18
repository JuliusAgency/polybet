export type Role = 'super_admin' | 'manager' | 'user';

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface SignInCredentials {
  username: string;
  password: string;
}
