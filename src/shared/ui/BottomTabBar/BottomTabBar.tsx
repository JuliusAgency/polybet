import type { ReactElement } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROUTES } from '@/app/router/routes';

/**
 * Persistent Polymarket-style bottom tab bar, mobile only (md:hidden). It carries
 * the four primary user destinations that previously lived in the hamburger menu —
 * no new routes, just always-visible navigation. Colors come from theme tokens;
 * icons are hand-rolled inline SVGs (the repo has no icon library). z-index 30 sits
 * BELOW the ActiveBetsDrawer (40/41), BetSlip/SidePanel (--z-modal:500) and Modal
 * backdrop (400) so it never floats over an open sheet.
 */
const ICON_SIZE = 22;

const iconProps = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '2',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const MarketsIcon = () => (
  <svg {...iconProps}>
    <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" />
    <path d="M9 21v-6h6v6" />
  </svg>
);

const PortfolioIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 12h18" />
  </svg>
);

const WalletIcon = () => (
  <svg {...iconProps}>
    <path d="M19 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    <path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z" />
  </svg>
);

const StatsIcon = () => (
  <svg {...iconProps}>
    <path d="M3 20h18" />
    <path d="M6 20v-7" />
    <path d="M12 20V5" />
    <path d="M18 20v-10" />
  </svg>
);

interface Tab {
  to: string;
  labelKey: string;
  Icon: () => ReactElement;
  /** Path prefixes that should keep this tab active (e.g. event detail under Markets). */
  match: string[];
}

const TABS: Tab[] = [
  { to: ROUTES.USER.MARKETS, labelKey: 'nav.allMarkets', Icon: MarketsIcon, match: ['/markets', '/events'] },
  { to: ROUTES.USER.MY_BETS, labelKey: 'nav.myBets', Icon: PortfolioIcon, match: ['/my-bets'] },
  { to: ROUTES.USER.WALLET, labelKey: 'nav.wallet', Icon: WalletIcon, match: ['/wallet'] },
  { to: ROUTES.USER.STATS, labelKey: 'nav.stats', Icon: StatsIcon, match: ['/stats'] },
];

const isTabActive = (pathname: string, match: string[]) =>
  match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

export const BottomTabBar = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <nav
      aria-label={t('nav.primary')}
      className="fixed inset-x-0 bottom-0 flex md:hidden"
      style={{
        zIndex: 30,
        backgroundColor: 'var(--color-bg-surface)',
        borderTop: '1px solid var(--color-border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {TABS.map(({ to, labelKey, Icon, match }) => {
        const active = isTabActive(pathname, match);
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium"
            style={{
              color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              textDecoration: 'none',
            }}
          >
            <Icon />
            <span>{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
};
