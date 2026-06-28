import { useEffect, useState, type ReactNode } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/hooks/useAuth';
import { ROUTES } from '@/app/router/routes';
import { LanguageSwitcher } from '@/shared/ui/LanguageSwitcher';
import { ThemeSwitcher } from '@/shared/ui/ThemeSwitcher';
import './ManagerLayout.css';

// py-2.5 keeps the link tap area comfortable (~44px) on the touch drawer while
// staying tidy on the desktop sidebar — the same nav is shared by both.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'side-nav--active' : 'side-nav--idle'
  }`;

export const ManagerLayout = () => {
  const { t, i18n } = useTranslation();
  const { profile, signOut } = useAuth();
  // Below lg the fixed sidebar collapses into a slide-in drawer opened from the
  // mobile top bar; at lg+ the sidebar is always visible and this stays false.
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isRTL = i18n.language === 'he';

  // Close the drawer on Escape — it is a modal overlay below lg.
  useEffect(() => {
    if (!isDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsDrawerOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen]);

  const closeDrawer = () => setIsDrawerOpen(false);

  // Shared nav + footer so the desktop sidebar and the mobile drawer never drift.
  // onNavigate lets the drawer close itself when a destination is picked.
  const navLinks = (onNavigate?: () => void): ReactNode => (
    <nav className="flex-1 px-4 py-6 space-y-1">
      <NavLink to={ROUTES.MANAGER.MARKETS} className={navLinkClass} onClick={onNavigate}>
        {t('nav.markets')}
      </NavLink>
      <NavLink to={ROUTES.MANAGER.USERS} className={navLinkClass} onClick={onNavigate}>
        {t('nav.users')}
      </NavLink>
      <NavLink to={ROUTES.MANAGER.REPORTS} className={navLinkClass} onClick={onNavigate}>
        {t('nav.reports')}
      </NavLink>
      <NavLink to={ROUTES.MANAGER.ACTIVITY} className={navLinkClass} onClick={onNavigate}>
        {t('nav.activity')}
      </NavLink>
    </nav>
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

  return (
    <div
      className="lg:flex lg:h-screen"
      style={{
        minHeight: '100dvh',
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

      {/* Mobile top bar — only below lg. Hosts the hamburger that opens the
          drawer plus the brand; sticky so it stays put as the page scrolls. */}
      <header
        className="lg:hidden sticky top-0 flex items-center gap-3 px-4 h-14"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderBottom: '1px solid var(--color-border)',
          zIndex: 'var(--z-sticky)',
        }}
      >
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-md -ms-2"
          style={{
            color: 'var(--color-text-secondary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
          aria-label={t('nav.menu')}
          aria-expanded={isDrawerOpen}
        >
          <MenuIcon />
        </button>
        <span className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
          PolyBet
        </span>
      </header>

      {/* Desktop sidebar — always visible at lg+. */}
      <aside
        className="hidden lg:flex w-60 flex-shrink-0 flex-col overflow-y-auto"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderInlineEnd: '1px solid var(--color-border)',
        }}
      >
        <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            PolyBet
          </span>
        </div>
        {navLinks()}
        {footer}
      </aside>

      {/* Mobile drawer + scrim — only mounted while open, below lg. The scrim
          dims the page and closes on tap; the drawer slides in from the
          inline-start edge (see ManagerLayout.css). */}
      {isDrawerOpen && (
        <>
          <div
            className="manager-drawer-backdrop lg:hidden"
            style={{ zIndex: 'var(--z-modal-backdrop)', backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
            onClick={closeDrawer}
            aria-hidden
          />
          <aside
            className="manager-drawer lg:hidden flex w-72 max-w-[85vw] flex-col overflow-y-auto"
            style={{
              backgroundColor: 'var(--color-bg-surface)',
              borderInlineEnd: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 'var(--z-modal)',
              ['--drawer-offscreen' as string]: isRTL ? '100%' : '-100%',
            }}
          >
            <div
              className="flex items-center justify-between gap-2 px-6 py-4"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <span className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                PolyBet
              </span>
              <button
                type="button"
                onClick={closeDrawer}
                className="flex h-11 w-11 items-center justify-center rounded-md -me-2"
                style={{
                  color: 'var(--color-text-secondary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
                aria-label={t('common.close')}
              >
                <CloseIcon />
              </button>
            </div>
            {navLinks(closeDrawer)}
            {footer}
          </aside>
        </>
      )}

      {/* min-w-0: as a flex child, main otherwise keeps its content's intrinsic
          width (min-width:auto), so a wide table would push the whole page wider
          than the viewport. min-w-0 lets it shrink so the table's own
          overflow-x-auto scroll container takes over instead. */}
      <main className="flex-1 min-w-0 lg:min-h-0 lg:overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

const MenuIcon = () => (
  <svg
    width="22"
    height="22"
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
    width="22"
    height="22"
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
