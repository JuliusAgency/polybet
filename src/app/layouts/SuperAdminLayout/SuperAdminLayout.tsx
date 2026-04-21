import { Outlet } from 'react-router-dom';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/hooks/useAuth';
import { ROUTES } from '@/app/router/routes';
import { LanguageSwitcher } from '@/shared/ui/LanguageSwitcher';
import { ThemeSwitcher } from '@/shared/ui/ThemeSwitcher';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'side-nav--active' : 'side-nav--idle'
  }`;

export const SuperAdminLayout = () => {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();

  return (
    <div
      className="flex"
      style={{
        height: '100vh',
        backgroundColor: 'var(--color-bg-base)',
        color: 'var(--color-text-primary)',
      }}
    >
      <style>{`
        .side-nav--idle {
          color: var(--color-text-secondary);
        }
        .side-nav--idle:hover {
          background-color: var(--color-hover);
          color: var(--color-text-primary);
        }
        .side-nav--active {
          background-color: var(--color-bg-elevated);
          color: var(--color-text-primary);
        }
      `}</style>

      <aside
        className="w-60 flex-shrink-0 flex flex-col overflow-y-auto"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderInlineEnd: '1px solid var(--color-border)',
        }}
      >
        <div
          className="px-6 py-5"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <span className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            PolyBet
          </span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          <NavLink to={ROUTES.ADMIN.DASHBOARD} className={navLinkClass}>
            {t('nav.dashboard')}
          </NavLink>
          <NavLink to={ROUTES.ADMIN.MANAGERS} className={navLinkClass}>
            {t('nav.managers')}
          </NavLink>
          <NavLink to={ROUTES.ADMIN.MARKETS} className={navLinkClass}>
            {t('nav.markets')}
          </NavLink>
          <NavLink to={ROUTES.ADMIN.BET_LOG} className={navLinkClass}>
            {t('nav.betLog')}
          </NavLink>
          <NavLink to={ROUTES.ADMIN.REPORTS} className={navLinkClass}>
            {t('nav.reports')}
          </NavLink>
          <NavLink to={ROUTES.ADMIN.LIMITS} className={navLinkClass}>
            {t('nav.betLimits')}
          </NavLink>
          <NavLink to={ROUTES.ADMIN.SETTINGS} className={navLinkClass}>
            {t('nav.settings')}
          </NavLink>
        </nav>

        <div
          className="px-4 pb-3 pt-3"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <NavLink to={ROUTES.ADMIN.TEST_LAB} className={navLinkClass}>
            {t('nav.testLab')}
          </NavLink>
        </div>

        <div
          className="px-4 py-4 flex flex-col gap-3"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-sm truncate"
              style={{ color: 'var(--color-text-secondary)' }}
            >
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
      </aside>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};
