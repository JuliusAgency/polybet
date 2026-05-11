// Test users seeded by supabase/seed/002_test_users.sql.
// The SignInForm takes a username; AuthProvider expands it to
// `${username}@polybet.internal` before calling supabase.auth.
// Reset state with `npx supabase db reset` if these get drifted.

export const TEST_USERS = {
  admin: { username: 'admin', password: 'Admin123!' },
  manager: { username: 'manager', password: 'Manager123!' },
  user1: { username: 'user1', password: 'User123!' },
  user2: { username: 'user2', password: 'User123!' },
  user3: { username: 'user3', password: 'User123!' },
} as const;

export type TestUserKey = keyof typeof TEST_USERS;
