import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/hooks/useAuth';
import type { Role } from '@/shared/types';
import { ROUTES } from './routes';

interface RoleGuardProps {
  allowedRoles: Role[];
  children: ReactNode;
}

const getDashboardForRole = (role: Role): string => {
  switch (role) {
    case 'super_admin':
      return ROUTES.ADMIN.DASHBOARD;
    case 'manager':
      return ROUTES.MANAGER.USERS;
    case 'user':
      return ROUTES.USER.MARKETS;
  }
};

export const RoleGuard = ({ allowedRoles, children }: RoleGuardProps) => {
  const { user, role, loading } = useAuth();
  const { t } = useTranslation();

  // Show spinner while initial auth bootstrap is running OR while role is still
  // loading after sign-in (auth state change fires before profile fetch completes).
  if (loading || (user !== null && role === null)) {
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
  }

  if (user === null) {
    return <Navigate to={ROUTES.SIGN_IN} replace />;
  }

  if (!allowedRoles.includes(role!)) {
    return <Navigate to={getDashboardForRole(role!)} replace />;
  }

  return <>{children}</>;
};
