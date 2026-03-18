import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RoleGuard } from './RoleGuard';
import { ROUTES } from './routes';
import {
  AuthLayout,
  SuperAdminLayout,
  ManagerLayout,
  UserLayout,
} from '@/app/layouts';

// Auth
const SignInPage = lazy(() => import('@/pages/auth/SignInPage'));

// Super admin
const AgentsDashboardPage = lazy(() => import('@/pages/super-admin/AgentsDashboardPage'));
const ManagersManagementPage = lazy(() => import('@/pages/super-admin/ManagersManagementPage'));
const ManagerProfilePage = lazy(() => import('@/pages/super-admin/ManagerProfilePage'));
const GlobalBetLogPage = lazy(() => import('@/pages/super-admin/GlobalBetLogPage'));

// Manager
const UsersManagementPage = lazy(() => import('@/pages/manager/UsersManagementPage'));
const UserActivityPage = lazy(() => import('@/pages/manager/UserActivityPage'));
const TreasuryPage = lazy(() => import('@/pages/manager/TreasuryPage'));
const ReportsPage = lazy(() => import('@/pages/manager/ReportsPage'));

// User
const MarketsFeedPage = lazy(() => import('@/pages/user/MarketsFeedPage'));
const WalletPage = lazy(() => import('@/pages/user/WalletPage'));
const MyBetsPage = lazy(() => import('@/pages/user/MyBetsPage'));

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
            path="/admin/*"
            element={
              <RoleGuard allowedRoles={['super_admin']}>
                <SuperAdminLayout>
                  <Routes>
                    <Route path="dashboard" element={<AgentsDashboardPage />} />
                    <Route path="managers" element={<ManagersManagementPage />} />
                    <Route path="managers/:id" element={<ManagerProfilePage />} />
                    <Route path="bets-log" element={<GlobalBetLogPage />} />
                    <Route path="*" element={<Navigate to={ROUTES.ADMIN.DASHBOARD} replace />} />
                  </Routes>
                </SuperAdminLayout>
              </RoleGuard>
            }
          />

          {/* Manager routes */}
          <Route
            path="/manager/*"
            element={
              <RoleGuard allowedRoles={['manager']}>
                <ManagerLayout>
                  <Routes>
                    <Route path="users" element={<UsersManagementPage />} />
                    <Route path="users/:id" element={<UserActivityPage />} />
                    <Route path="treasury" element={<TreasuryPage />} />
                    <Route path="reports" element={<ReportsPage />} />
                    <Route path="activity" element={<UserActivityPage />} />
                    <Route path="*" element={<Navigate to={ROUTES.MANAGER.USERS} replace />} />
                  </Routes>
                </ManagerLayout>
              </RoleGuard>
            }
          />

          {/* User routes */}
          <Route
            path="/*"
            element={
              <RoleGuard allowedRoles={['user']}>
                <UserLayout>
                  <Routes>
                    <Route path="markets" element={<MarketsFeedPage />} />
                    <Route path="wallet" element={<WalletPage />} />
                    <Route path="my-bets" element={<MyBetsPage />} />
                    <Route path="*" element={<Navigate to={ROUTES.USER.MARKETS} replace />} />
                  </Routes>
                </UserLayout>
              </RoleGuard>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to={ROUTES.SIGN_IN} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};
