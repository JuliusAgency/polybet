import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/hooks/useAuth';
import { ROUTES } from '@/app/router/routes';
import { LanguageSwitcher } from '@/shared/ui/LanguageSwitcher';
import { ThemeSwitcher } from '@/shared/ui/ThemeSwitcher';
import { AdminShell } from '@/app/layouts/AdminShell';

// py-2.5 keeps the link tap area comfortable (~44px) on the touch drawer while
// staying tidy on the desktop sidebar — the same nav is shared by both.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'side-nav--active' : 'side-nav--idle'
  }`;

export const SuperAdminLayout = () => {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();

  // Shared nav so the desktop sidebar and the mobile drawer never drift. The
  // TestLab link keeps its own separated section, but still closes the drawer.
  const renderNav = (onNavigate?: () => void): ReactNode => (
    <>
      <nav className="flex-1 px-4 py-6 space-y-1">
        <NavLink to={ROUTES.ADMIN.DASHBOARD} className={navLinkClass} onClick={onNavigate}>
          {t('nav.dashboard')}
        </NavLink>
        <NavLink to={ROUTES.ADMIN.MANAGERS} className={navLinkClass} onClick={onNavigate}>
          {t('nav.managers')}
        </NavLink>
        <NavLink to={ROUTES.ADMIN.MARKETS} className={navLinkClass} onClick={onNavigate}>
          {t('nav.markets')}
        </NavLink>
        <NavLink to={ROUTES.ADMIN.BET_LOG} className={navLinkClass} onClick={onNavigate}>
          {t('nav.betLog')}
        </NavLink>
        <NavLink to={ROUTES.ADMIN.REPORTS} className={navLinkClass} onClick={onNavigate}>
          {t('nav.reports')}
        </NavLink>
        <NavLink to={ROUTES.ADMIN.LIMITS} className={navLinkClass} onClick={onNavigate}>
          {t('nav.betLimits')}
        </NavLink>
        <NavLink to={ROUTES.ADMIN.SETTINGS} className={navLinkClass} onClick={onNavigate}>
          {t('nav.settings')}
        </NavLink>
      </nav>

      <div className="px-4 pb-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <NavLink to={ROUTES.ADMIN.TEST_LAB} className={navLinkClass} onClick={onNavigate}>
          {t('nav.testLab')}
        </NavLink>
      </div>
    </>
  );

  const footer: ReactNode = (
    <div
      className="px-4 py-4 flex flex-col gap-3"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>
          {profile?.username ?? ''}
        </span>
        <button
          onClick={() => void signOut()}
          className="text-sm transition-colors flex-shrink-0"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-secondary)';
          }}
        >
          {t('auth.signOut')}
        </button>
      </div>
      <ThemeSwitcher />
      <LanguageSwitcher />
    </div>
  );

  return <AdminShell renderNav={renderNav} footer={footer} />;
};
