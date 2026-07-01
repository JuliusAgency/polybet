import { registerAdminSweep } from './sweep';

// Manager console — every statically-reachable route. Paths mirror
// ROUTES.MANAGER in src/app/router/routes.ts (users/:id needs an id and is
// covered by the /manager/activity route, which renders the same page).
registerAdminSweep('manager', [
  { label: 'users', path: '/manager/users' },
  { label: 'markets', path: '/manager/markets' },
  { label: 'reports', path: '/manager/reports' },
  { label: 'activity', path: '/manager/activity' },
]);
