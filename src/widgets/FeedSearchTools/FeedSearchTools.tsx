import { useTranslation } from 'react-i18next';
import './feedSearchTools.css';

interface FeedSearchToolsProps {
  /** Whether the user has open bets — gates the My bets toggle. */
  showMyBets: boolean;
  myBetsActive: boolean;
  onMyBetsToggle: () => void;
  /** Saved-only feed view is active. */
  savedActive: boolean;
  onSavedToggle: () => void;
  /** The status-filter bar is open. */
  filtersActive: boolean;
  onFiltersToggle: () => void;
}

/**
 * Icon-only toggles rendered to the start side of the markets search input
 * (Polymarket-style), text-free with the label in tooltip + aria-label:
 *   • My bets — bullseye, scopes the feed to the user's open-bet markets.
 *   • Saved — bookmark, the saved-only view.
 *   • Filter — sliders, opens the status-filter bar (Open / Closed / Archived …).
 */
export function FeedSearchTools({
  showMyBets,
  myBetsActive,
  onMyBetsToggle,
  savedActive,
  onSavedToggle,
  filtersActive,
  onFiltersToggle,
}: FeedSearchToolsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center gap-1">
      {showMyBets && (
        <button
          type="button"
          onClick={onMyBetsToggle}
          aria-pressed={myBetsActive}
          aria-label={t('markets.myBets')}
          title={t('markets.myBets')}
          className={`feed-tool-btn${myBetsActive ? ' feed-tool-btn--active' : ''}`}
        >
          <TargetIcon />
        </button>
      )}
      <button
        type="button"
        onClick={onSavedToggle}
        aria-pressed={savedActive}
        aria-label={t('markets.savedButton')}
        title={t('markets.savedButton')}
        className={`feed-tool-btn${savedActive ? ' feed-tool-btn--active' : ''}`}
      >
        <BookmarkIcon active={savedActive} />
      </button>
      <button
        type="button"
        onClick={onFiltersToggle}
        aria-pressed={filtersActive}
        aria-label={t('markets.filters')}
        title={t('markets.filters')}
        className={`feed-tool-btn${filtersActive ? ' feed-tool-btn--active' : ''}`}
      >
        <SlidersIcon />
      </button>
    </div>
  );
}

function TargetIcon() {
  // Bullseye — concentric circles with a filled center dot. Reads as "you aimed,
  // you placed your bet", matching the My bets semantics.
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SlidersIcon() {
  // Filter sliders — three horizontal tracks with offset knobs. Mirrors the
  // Polymarket header filter glyph.
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="21" y1="4" x2="14" y2="4" />
      <line x1="10" y1="4" x2="3" y2="4" />
      <line x1="21" y1="12" x2="12" y2="12" />
      <line x1="8" y1="12" x2="3" y2="12" />
      <line x1="21" y1="20" x2="16" y2="20" />
      <line x1="12" y1="20" x2="3" y2="20" />
      <line x1="14" y1="2" x2="14" y2="6" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <line x1="16" y1="18" x2="16" y2="22" />
    </svg>
  );
}

interface BookmarkIconProps {
  active: boolean;
}

function BookmarkIcon({ active }: BookmarkIconProps) {
  // Bookmark — filled when the saved-only view is active, outline otherwise.
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}
