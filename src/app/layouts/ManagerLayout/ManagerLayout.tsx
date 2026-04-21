import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/hooks/useAuth';
import { ROUTES } from '@/app/router/routes';
import { LanguageSwitcher } from '@/shared/ui/LanguageSwitcher';
import { ThemeSwitcher } from '@/shared/ui/ThemeSwitcher';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'side-nav--active' : 'side-nav--idle'
  }`;

export const ManagerLayout = () => {
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
          <NavLink to={ROUTES.MANAGER.MARKETS} className={navLinkClass}>
            {t('nav.markets')}
          </NavLink>
          <NavLink to={ROUTES.MANAGER.USERS} className={navLinkClass}>
            {t('nav.users')}
          </NavLink>
          <NavLink to={ROUTES.MANAGER.REPORTS} className={navLinkClass}>
            {t('nav.reports')}
          </NavLink>
          <NavLink to={ROUTES.MANAGER.ACTIVITY} className={navLinkClass}>
            {t('nav.activity')}
          </NavLink>
        </nav>

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
