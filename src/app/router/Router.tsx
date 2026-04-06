import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RoleGuard } from './RoleGuard';
import { ROUTES } from './routes';
import UsersManagementPage from '@/pages/manager/UsersManagementPage/UsersManagementPage';
import ManagerMarketsPage from '@/pages/manager/MarketsPage/MarketsPage';
import UserActivityPage from '@/pages/manager/UserActivityPage/UserActivityPage';
import ReportsPage from '@/pages/manager/ReportsPage/ReportsPage';
import { AuthLayout, SuperAdminLayout, ManagerLayout, UserLayout } from '@/app/layouts';

// Auth
const SignInPage = lazy(() => import('@/pages/auth/SignInPage'));

// Super admin
const AgentsDashboardPage = lazy(() => import('@/pages/super-admin/AgentsDashboardPage'));
const ManagersManagementPage = lazy(() => import('@/pages/super-admin/ManagersManagementPage'));
const ManagerProfilePage = lazy(() => import('@/pages/super-admin/ManagerProfilePage'));
const AdminMarketsPage = lazy(() => import('@/pages/super-admin/MarketsPage'));
const GlobalBetLogPage = lazy(() => import('@/pages/super-admin/GlobalBetLogPage'));
const AdminReportsPage = lazy(() => import('@/pages/super-admin/ReportsPage'));
const TestLabPage = lazy(() =>
  import('@/pages/super-admin/TestLabPage').then((m) => ({ default: m.TestLabPage }))
);
const BetLimitsPage = lazy(() =>
  import('@/pages/super-admin/BetLimitsPage').then((m) => ({ default: m.BetLimitsPage }))
);
const SettingsPage = lazy(() =>
  import('@/pages/super-admin/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

// Manager
// Keep manager pages as eager imports to avoid lazy chunk mismatch in dev navigation.

// User
const MarketsFeedPage = lazy(() => import('@/pages/user/MarketsFeedPage'));
const WalletPage = lazy(() => import('@/pages/user/WalletPage'));
const MyBetsPage = lazy(() => import('@/pages/user/MyBetsPage'));
const StatsPage = lazy(() => import('@/pages/user/StatsPage'));

const PageFallback = () => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
      }}
    >
      {t('auth.loading')}
    </div>
  );
};

export const Router = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Default redirect */}
          <Route path="/" element={<Navigate to={ROUTES.SIGN_IN} replace />} />

          {/* Auth */}
          <Route
            path={ROUTES.SIGN_IN}
            element={
              <AuthLayout>
                <SignInPage />
              </AuthLayout>
            }
          />

          {/* Super admin routes */}
          <Route
            path="/admin"
            element={
              <RoleGuard allowedRoles={['super_admin']}>
                <SuperAdminLayout />
              </RoleGuard>
            }
          >
            <Route index element={<Navigate to={ROUTES.ADMIN.DASHBOARD} replace />} />
            <Route path="dashboard" element={<AgentsDashboardPage />} />
            <Route path="managers" element={<ManagersManagementPage />} />
            <Route path="managers/:id" element={<ManagerProfilePage />} />
            <Route path="markets" element={<AdminMarketsPage />} />
            <Route path="bets-log" element={<GlobalBetLogPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
            <Route path="test-lab" element={<TestLabPage />} />
            <Route path="limits" element={<BetLimitsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to={ROUTES.ADMIN.DASHBOARD} replace />} />
          </Route>

          {/* Manager routes */}
          <Route
            path="/manager"
            element={
              <RoleGuard allowedRoles={['manager']}>
                <ManagerLayout />
              </RoleGuard>
            }
          >
            <Route index element={<Navigate to={ROUTES.MANAGER.USERS} replace />} />
            <Route path="markets" element={<ManagerMarketsPage />} />
            <Route path="users" element={<UsersManagementPage />} />
            <Route path="users/:id" element={<UserActivityPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="activity" element={<UserActivityPage />} />
            <Route path="*" element={<Navigate to={ROUTES.MANAGER.USERS} replace />} />
          </Route>

          {/* User routes - pathless layout route, paths matched from root */}
          <Route
            element={
              <RoleGuard allowedRoles={['user']}>
                <UserLayout />
              </RoleGuard>
            }
          >
            <Route path="markets" element={<MarketsFeedPage />} />
            <Route path="wallet" element={<WalletPage />} />
            <Route path="my-bets" element={<MyBetsPage />} />
            <Route path="stats" element={<StatsPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to={ROUTES.SIGN_IN} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};
