import { registerAdminSweep } from './sweep';

// Super-admin console — every statically-reachable route. Detail routes
// (managers/:id, markets/:id) need an id and are exercised via the loop if the
// review flags them. Paths mirror ROUTES.ADMIN in src/app/router/routes.ts.
registerAdminSweep('admin', [
  { label: 'dashboard', path: '/admin/dashboard' },
  { label: 'managers', path: '/admin/managers' },
  { label: 'markets', path: '/admin/markets' },
  { label: 'bets-log', path: '/admin/bets-log' },
  { label: 'reports', path: '/admin/reports' },
  { label: 'limits', path: '/admin/limits' },
  { label: 'settings', path: '/admin/settings' },
  { label: 'test-lab', path: '/admin/test-lab' },
]);
