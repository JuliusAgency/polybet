import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/hooks/useAuth';
import { ROUTES } from '@/app/router/routes';
import { LanguageSwitcher } from '@/shared/ui/LanguageSwitcher';
import { ThemeSwitcher } from '@/shared/ui/ThemeSwitcher';
import { useUserBalance, useMyBets, useBetResultNotifications } from '@/features/bet';
import { ActiveBetsDrawer } from '@/widgets/ActiveBetsDrawer';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'nav-link--active' : 'nav-link--idle'
  }`;

export const UserLayout = () => {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const { data: balance } = useUserBalance();
  const { data: bets } = useMyBets();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Mount globally so settlement notifications fire on any page
  useBetResultNotifications();

  const inPlay = balance?.in_play ?? 0;
  // Mirror MarketsFeedPage: only open bets lock stake in In-Play.
  const openBetsCount = (bets ?? []).filter((b) => b.status === 'open').length;

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
        <div className="max-w-[90rem] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
              PolyBet
            </span>
            <nav className="flex items-center gap-1">
              <NavLink to={ROUTES.USER.MARKETS} className={navLinkClass}>
                {t('nav.allMarkets')}
              </NavLink>
              <NavLink to={ROUTES.USER.MY_BETS} className={navLinkClass}>
                {t('nav.myBets')}
              </NavLink>
              <NavLink to={ROUTES.USER.WALLET} className={navLinkClass}>
                {t('nav.wallet')}
              </NavLink>
              <NavLink to={ROUTES.USER.STATS} className={navLinkClass}>
                {t('nav.stats')}
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span
              className="hidden text-sm sm:inline"
              style={{ color: 'var(--color-text-secondary)' }}
            >
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

            {/* In-Play balance — clickable, opens the active-bets drawer. Moved
                here from the Markets page BalanceWidget so the drawer stays
                reachable from every user page. */}
            {balance != null && (
              <>
                <div
                  style={{
                    width: '1px',
                    height: '16px',
                    backgroundColor: 'var(--color-border)',
                  }}
                />
                <button
                  onClick={() => setIsDrawerOpen(true)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', outline: 'none' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-elevated)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  aria-label={t('wallet.inPlay')}
                >
                  <span
                    className="hidden text-xs md:inline"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('wallet.inPlay')}
                  </span>
                  <span
                    className="font-mono text-sm font-semibold"
                    style={{
                      color: inPlay > 0 ? 'var(--color-accent)' : 'var(--color-text-primary)',
                    }}
                  >
                    {inPlay.toFixed(2)}
                  </span>
                  {openBetsCount > 0 && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--color-accent)',
                        color: 'var(--color-bg-base)',
                      }}
                    >
                      {t('markets.activeBets_other', { count: openBetsCount })}
                    </span>
                  )}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div
                  style={{
                    width: '1px',
                    height: '16px',
                    backgroundColor: 'var(--color-border)',
                  }}
                />
              </>
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

      <main className="flex-1 max-w-[90rem] w-full mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Active bets drawer — opened from the In-Play indicator in the header. */}
      <ActiveBetsDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
};
