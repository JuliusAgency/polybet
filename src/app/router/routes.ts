export const ROUTES = {
  SIGN_IN: '/sign-in',

  ADMIN: {
    DASHBOARD: '/admin/dashboard',
    MANAGERS: '/admin/managers',
    MANAGER_PROFILE: '/admin/managers/:id',
    BET_LOG: '/admin/bets-log',
  },

  MANAGER: {
    USERS: '/manager/users',
    USER_PROFILE: '/manager/users/:id',
    TREASURY: '/manager/treasury',
    REPORTS: '/manager/reports',
    ACTIVITY: '/manager/activity',
  },

  USER: {
    MARKETS: '/markets',
    WALLET: '/wallet',
    MY_BETS: '/my-bets',
  },
} as const;

export const buildPath = (path: string, params: Record<string, string>): string => {
  return Object.entries(params).reduce(
    (acc, [key, val]) => acc.replace(`:${key}`, val),
    path
  );
};
