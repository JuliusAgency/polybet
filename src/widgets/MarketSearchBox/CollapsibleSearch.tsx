import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './collapsibleSearch.css';

interface CollapsibleSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /**
   * Always-expanded full-width pill variant (S1). Used on the mobile search row
   * beneath the title: the field fills its row, the magnifier is a static
   * adornment on the inline-start, and the input never collapses. The default
   * (collapse-on-blur) variant is kept for the desktop H1 row.
   */
  fullWidth?: boolean;
}

/**
 * Polymarket-style collapsible search. Collapsed it is just a magnifier icon
 * button (matching the adjacent Saved / My bets tool icons); clicking it expands
 * an inline input that auto-focuses. It collapses again on blur only when empty,
 * so an active query keeps the field open across tab switches. The clear (×)
 * button wipes the query and keeps focus.
 *
 * With `fullWidth`, it renders as an always-open full-width pill instead (mobile
 * search row) — the magnifier becomes a static start adornment.
 */
export function CollapsibleSearch({
  value,
  onChange,
  placeholder,
  fullWidth = false,
}: CollapsibleSearchProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // A non-empty query keeps the field open regardless of focus so switching to
  // My bets / Saved (or clicking away) never silently drops an active search.
  // The full-width variant is always open.
  const open = fullWidth || expanded || value.trim().length > 0;

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const rootClass = `feed-search${open ? ' feed-search--open' : ''}${
    fullWidth ? ' feed-search--full' : ''
  }`;

  return (
    <div className={rootClass}>
      {fullWidth ? (
        // Static magnifier adornment — not a button (the field is already open).
        <span aria-hidden className="feed-search__icon">
          <SearchIcon />
        </span>
      ) : (
        <button
          type="button"
          className="feed-search__icon"
          aria-label={placeholder}
          title={placeholder}
          onClick={() => {
            setExpanded(true);
            inputRef.current?.focus();
          }}
        >
          <SearchIcon />
        </button>
      )}
      <input
        ref={inputRef}
        type="text"
        className="feed-search__input"
        value={value}
        placeholder={placeholder}
        tabIndex={open ? 0 : -1}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          // Collapse only when there is nothing to keep; a live query stays open.
          if (value.trim().length === 0) setExpanded(false);
        }}
      />
      {open && value.length > 0 && (
        <button
          type="button"
          className="feed-search__clear"
          aria-label={t('markets.clearSearch')}
          title={t('markets.clearSearch')}
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}

function SearchIcon() {
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
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
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
}
