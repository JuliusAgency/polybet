import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMarkets } from '@/features/bet';
import type { Market } from '@/entities/market';
import { useDebounce } from '@/shared/hooks/useDebounce';
import './navMarketSearch.css';

// Only query once the term is meaningful — avoids firing the feed query on
// every single keystroke and on empty/1-char input.
const MIN_QUERY_LENGTH = 2;
// How many results the dropdown shows at once (Polymarket-style short list).
const MAX_RESULTS = 8;

/**
 * Persistent navbar market search (Polymarket-style combobox). Searches markets
 * by question via the feed's server-side `question` ilike, debounced, and shows
 * a results dropdown. Fully keyboard-navigable (Arrow keys / Enter / Escape) and
 * closes on outside click. Selecting a result opens that market's event detail.
 */
interface NavMarketSearchProps {
  /** Resolves an event id to its detail URL. Injected by the parent layout so
   *  this widget does not import the app-layer route map (FSD). */
  buildEventHref: (eventId: string) => string;
}

export function NavMarketSearch({ buildEventHref }: NavMarketSearchProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const debouncedQuery = useDebounce(query, 300);
  const trimmed = debouncedQuery.trim();
  const enabled = trimmed.length >= MIN_QUERY_LENGTH;

  const { markets, isLoading } = useMarkets('all', enabled ? trimmed : '');
  const results = enabled ? markets.slice(0, MAX_RESULTS) : [];

  // Reset the highlighted row whenever the result set changes so the selection
  // never points past the end of a shorter list. Adjusting state during render
  // (React's recommended pattern) avoids a setState-in-effect cascade.
  const resultsKey = `${trimmed}|${results.length}`;
  const [lastResultsKey, setLastResultsKey] = useState(resultsKey);
  if (lastResultsKey !== resultsKey) {
    setLastResultsKey(resultsKey);
    setHighlight(0);
  }

  // Close on any pointer interaction outside the combobox.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Markets attached to an event open the event detail; standalone markets fall
  // back to their own id on the same route (mirrors the feed's detailHref rule).
  const hrefFor = (market: Market) => buildEventHref(market.event_id ?? market.id);

  const goTo = (market: Market) => {
    setOpen(false);
    setQuery('');
    navigate(hrefFor(market));
  };

  // Open the dropdown as soon as the LIVE query is searchable (not the debounced
  // value) so the panel is never invisible during the 300ms debounce window —
  // the reason the dropdown "sometimes didn't appear" while typing.
  const liveEnabled = query.trim().length >= MIN_QUERY_LENGTH;
  const showDropdown = open && liveEnabled;
  // Results for the current term aren't ready while the debounce hasn't caught up
  // or the fetch is still in flight; show a "Searching…" row instead of an empty
  // (zero-height, invisible) dropdown.
  const isSearchPending = liveEnabled && (isLoading || debouncedQuery.trim() !== query.trim());

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => (index + 1) % results.length);
      return;
    }
    if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => (index - 1 + results.length) % results.length);
      return;
    }
    if (event.key === 'Enter' && results.length > 0) {
      event.preventDefault();
      const target = results[highlight] ?? results[0];
      if (target) goTo(target);
    }
  };

  const activeOptionId =
    showDropdown && results.length > 0 ? `${listboxId}-opt-${highlight}` : undefined;

  return (
    <div ref={containerRef} className="nav-market-search">
      <span className="nav-market-search__icon" aria-hidden="true">
        <SearchIcon />
      </span>
      <input
        type="text"
        role="combobox"
        aria-label={t('markets.searchMarketsAria')}
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        className="nav-market-search__input"
        value={query}
        placeholder={t('markets.searchNavPlaceholder')}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />

      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={t('markets.searchResultsAria')}
          className="nav-market-search__results"
        >
          {results.length > 0 ? (
            results.map((market, index) => {
              const isActive = index === highlight;
              const subtitle = market.event?.title ?? market.category ?? '';
              return (
                <li
                  key={market.id}
                  id={`${listboxId}-opt-${index}`}
                  role="option"
                  aria-selected={isActive}
                  className={`nav-market-search__option${isActive ? ' nav-market-search__option--active' : ''}`}
                  // pointerdown (not click) so the outside-click closer doesn't
                  // fire first and tear down the list before navigation.
                  onPointerDown={(event) => {
                    event.preventDefault();
                    goTo(market);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                >
                  <span className="nav-market-search__option-title">{market.question}</span>
                  {subtitle && (
                    <span className="nav-market-search__option-subtitle">{subtitle}</span>
                  )}
                </li>
              );
            })
          ) : isSearchPending ? (
            <li className="nav-market-search__empty" role="option" aria-disabled="true">
              {t('markets.searching')}
            </li>
          ) : (
            <li className="nav-market-search__empty" role="option" aria-disabled="true">
              {t('markets.noResults')}
            </li>
          )}
        </ul>
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
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
