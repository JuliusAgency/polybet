import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/hooks/useAuth';
import { ROUTES } from '@/app/router/routes';
import { LanguageSwitcher } from '@/shared/ui/LanguageSwitcher';

export const ManagerLayout = () => {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();

  return (
    <div className="flex bg-gray-950 text-gray-100" style={{ height: '100vh' }}>
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-gray-900 flex flex-col overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-800">
          <span className="text-xl font-bold text-white">PolyBet</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          <NavLink
            to={ROUTES.MANAGER.MARKETS}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            {t('nav.markets')}
          </NavLink>
          <NavLink
            to={ROUTES.MANAGER.USERS}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            {t('nav.users')}
          </NavLink>
          <NavLink
            to={ROUTES.MANAGER.REPORTS}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            {t('nav.reports')}
          </NavLink>
          <NavLink
            to={ROUTES.MANAGER.ACTIVITY}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            {t('nav.activity')}
          </NavLink>
        </nav>

        <div className="px-4 py-4 border-t border-gray-800 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-gray-400 truncate">{profile?.username ?? ''}</span>
            <button
              onClick={() => void signOut()}
              className="text-sm text-gray-400 hover:text-white transition-colors flex-shrink-0"
            >
              {t('auth.signOut')}
            </button>
          </div>
          <LanguageSwitcher />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};
