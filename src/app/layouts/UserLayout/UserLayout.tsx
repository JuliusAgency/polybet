import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/hooks/useAuth';
import { ROUTES } from '@/app/router/routes';
import { LanguageSwitcher } from '@/shared/ui/LanguageSwitcher';
import { UnseenBadge } from '@/shared/ui/UnseenBadge';
import { useUserBalance, useBetResultNotifications, useUnseenBetsCount } from '@/features/bet';

export const UserLayout = () => {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const { data: balance } = useUserBalance();

  // Mount globally so notifications fire on any page
  useBetResultNotifications();
  const unseenCount = useUnseenBetsCount();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Top navbar */}
      <header className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo + Nav links */}
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-white">PolyBet</span>
            <nav className="flex items-center gap-1">
              <NavLink
                to={ROUTES.USER.MARKETS}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                {t('nav.markets')}
              </NavLink>
              <NavLink
                to={ROUTES.USER.MY_BETS}
                className={({ isActive }) =>
                  `relative px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                {t('nav.myBets')}
                <UnseenBadge count={unseenCount} />
              </NavLink>
              <NavLink
                to={ROUTES.USER.WALLET}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                {t('nav.wallet')}
              </NavLink>
              <NavLink
                to={ROUTES.USER.STATS}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                {t('nav.stats')}
              </NavLink>
            </nav>
          </div>

          {/* Right: balance + sign out */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              {profile?.username ?? ''}
            </span>
            {balance != null && (
              <span className="text-sm font-mono font-semibold text-green-400">
                {(balance.available).toFixed(2)}
              </span>
            )}
            <button
              onClick={() => void signOut()}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              {t('auth.signOut')}
            </button>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
};
