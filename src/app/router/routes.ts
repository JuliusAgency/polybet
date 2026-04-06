export const ROUTES = {
  SIGN_IN: '/sign-in',

  ADMIN: {
    DASHBOARD: '/admin/dashboard',
    MANAGERS: '/admin/managers',
    MANAGER_PROFILE: '/admin/managers/:id',
    MARKETS: '/admin/markets',
    BET_LOG: '/admin/bets-log',
    REPORTS: '/admin/reports',
    TEST_LAB: '/admin/test-lab',
    LIMITS: '/admin/limits',
    SETTINGS: '/admin/settings',
  },

  MANAGER: {
    USERS: '/manager/users',
    USER_PROFILE: '/manager/users/:id',
    MARKETS: '/manager/markets',
    REPORTS: '/manager/reports',
    ACTIVITY: '/manager/activity',
  },

  USER: {
    MARKETS: '/markets',
    WALLET: '/wallet',
    MY_BETS: '/my-bets',
    STATS: '/stats',
  },
} as const;

export const buildPath = (path: string, params: Record<string, string>): string => {
  return Object.entries(params).reduce((acc, [key, val]) => acc.replace(`:${key}`, val), path);
};
