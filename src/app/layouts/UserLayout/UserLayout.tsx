import { useState } from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/hooks/useAuth';
import { ROUTES, buildPath } from '@/app/router/routes';
import { LanguageSwitcher } from '@/shared/ui/LanguageSwitcher';
import { ThemeSwitcher } from '@/shared/ui/ThemeSwitcher';
import { useUserBalance, useMyBets, useBetResultNotifications } from '@/features/bet';
import { ActiveBetsDrawer } from '@/widgets/ActiveBetsDrawer';
import { NavMarketSearch } from '@/widgets/NavMarketSearch';
import { BottomTabBar } from '@/shared/ui/BottomTabBar';

const buildEventHref = (id: string) => buildPath(ROUTES.USER.EVENT_DETAIL, { id });

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
  // Mobile nav menu (hamburger) — the inline nav links + controls collapse into
  // this below the md breakpoint so the header fits from 320px up.
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
        className="sticky top-0"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderBottom: '1px solid var(--color-border)',
          zIndex: 'var(--z-sticky)',
        }}
      >
        <div className="max-w-[90rem] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-6">
            {/* Logo returns to the All-markets home from every page. */}
            <Link
              to={ROUTES.USER.MARKETS}
              className="text-lg font-bold"
              style={{ color: 'var(--color-text-primary)', textDecoration: 'none' }}
            >
              PolyBet
            </Link>
            {/* Desktop nav — collapses into the hamburger menu below md so the
                header never crams / wraps on small screens. */}
            <nav className="hidden items-center gap-1 md:flex">
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
              {/* Polymarket-style persistent market search, adjacent to Stats.
                  Deferred to xl so the bar isn't crammed at md/lg widths (the
                  feed has its own in-page search; this is a convenience). */}
              <div className="ms-2 hidden xl:block">
                <NavMarketSearch buildEventHref={buildEventHref} />
              </div>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Username is the least-essential chrome — defer it to xl so the
                bar isn't crammed at md/lg widths (e.g. ~1100px). */}
            <span
              className="hidden text-sm xl:inline"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {profile?.username ?? ''}
            </span>
            {balance != null && (
              <span className="num text-sm font-semibold" style={{ color: 'var(--color-win)' }}>
                {balance.available.toFixed(2)}
              </span>
            )}

            {/* In-Play balance — clickable, opens the active-bets drawer. Moved
                here from the Markets page BalanceWidget so the drawer stays
                reachable from every user page. */}
            {balance != null && (
              <>
                <div
                  className="hidden md:block"
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
                    className="hidden whitespace-nowrap text-xs xl:inline"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('wallet.inPlay')}
                  </span>
                  <span
                    className="num text-sm font-semibold"
                    style={{
                      color: inPlay > 0 ? 'var(--color-accent)' : 'var(--color-text-primary)',
                    }}
                  >
                    {inPlay.toFixed(2)}
                  </span>
                  {openBetsCount > 0 && (
                    <span
                      className="hidden whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium leading-none xl:inline-flex"
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
                  className="hidden md:block"
                  style={{
                    width: '1px',
                    height: '16px',
                    backgroundColor: 'var(--color-border)',
                  }}
                />
              </>
            )}

            {/* Desktop-only controls — collapse into the mobile menu below md. */}
            <div className="hidden items-center gap-3 md:flex">
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

            {/* Mobile hamburger — toggles the collapsed nav menu below md. */}
            <button
              type="button"
              onClick={() => setIsMenuOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-md md:hidden"
              style={{
                color: 'var(--color-text-secondary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
              aria-label={t('nav.more')}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>

        {/* Mobile "More" menu — secondary controls (theme, language, sign out).
            Floats as a dropdown OVER the feed (absolute, anchored to the sticky
            header) instead of pushing the page down, with elevation so it reads
            as a layer above the content. A transparent backdrop below the header
            row closes it on an outside tap while leaving the row interactive. */}
        {isMenuOpen && (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-x-0 bottom-0 top-14 cursor-default md:hidden"
              style={{ zIndex: 'var(--z-dropdown)', background: 'transparent', border: 'none' }}
            />
            <nav
              className="absolute inset-x-0 top-full flex flex-col gap-2 border-b px-4 py-3 md:hidden"
              style={{
                zIndex: 'var(--z-dropdown)',
                backgroundColor: 'var(--color-bg-elevated)',
                borderColor: 'var(--color-border)',
                borderBottomLeftRadius: 'var(--radius-lg)',
                borderBottomRightRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {t('nav.more')}
              </span>
              <div className="flex items-center gap-3">
                <ThemeSwitcher />
                <LanguageSwitcher />
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    void signOut();
                  }}
                  className="ms-auto text-sm"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t('auth.signOut')}
                </button>
              </div>
            </nav>
          </>
        )}
      </header>

      {/* pb-24 on mobile reserves room for the fixed BottomTabBar so the last
          content row is never hidden behind it; restored to pb-6 from md up. */}
      <main className="flex-1 max-w-[90rem] w-full mx-auto px-4 pt-6 pb-24 md:pb-6">
        <Outlet />
      </main>

      {/* Persistent Polymarket-style bottom navigation — mobile only (md:hidden). */}
      <BottomTabBar />

      {/* Active bets drawer — opened from the In-Play indicator in the header. */}
      <ActiveBetsDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
};

const MenuIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const CloseIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
