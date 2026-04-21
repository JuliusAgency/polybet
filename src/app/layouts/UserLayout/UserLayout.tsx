import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/hooks/useAuth';
import { ROUTES } from '@/app/router/routes';
import { LanguageSwitcher } from '@/shared/ui/LanguageSwitcher';
import { ThemeSwitcher } from '@/shared/ui/ThemeSwitcher';
import { UnseenBadge } from '@/shared/ui/UnseenBadge';
import { useUserBalance, useBetResultNotifications, useUnseenBetsCount } from '@/features/bet';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'nav-link--active' : 'nav-link--idle'
  }`;

export const UserLayout = () => {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const { data: balance } = useUserBalance();

  // Mount globally so notifications fire on any page
  useBetResultNotifications();
  const unseenCount = useUnseenBetsCount();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}
    >
      <style>{`
        .nav-link--idle {
          color: var(--color-text-secondary);
        }
        .nav-link--idle:hover {
          background-color: var(--color-hover);
          color: var(--color-text-primary);
        }
        .nav-link--active {
          background-color: var(--color-bg-elevated);
          color: var(--color-text-primary);
        }
      `}</style>

      <header
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span
              className="text-lg font-bold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              PolyBet
            </span>
            <nav className="flex items-center gap-1">
              <NavLink to={ROUTES.USER.MARKETS} className={navLinkClass}>
                {t('nav.markets')}
              </NavLink>
              <NavLink to={ROUTES.USER.MY_BETS} className={navLinkClass}>
                <span className="relative inline-block">
                  {t('nav.myBets')}
                  <UnseenBadge count={unseenCount} />
                </span>
              </NavLink>
              <NavLink to={ROUTES.USER.WALLET} className={navLinkClass}>
                {t('nav.wallet')}
              </NavLink>
              <NavLink to={ROUTES.USER.STATS} className={navLinkClass}>
                {t('nav.stats')}
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {profile?.username ?? ''}
            </span>
            {balance != null && (
              <span
                className="text-sm font-mono font-semibold"
                style={{ color: 'var(--color-win)' }}
              >
                {balance.available.toFixed(2)}
              </span>
            )}
            <button
              onClick={() => void signOut()}
              className="text-sm transition-colors"
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
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
};
