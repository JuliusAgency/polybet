import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import 'flag-icons/css/flag-icons.min.css';
import { ROUTES, buildPath } from '@/app/router/routes';
import { useWorldCupWinner, type WorldCupCountry } from '@/features/bet';
import { Spinner } from '@/shared/ui/Spinner';
import { CountryList } from './CountryList';
import './worldCupMap.css';

// cobe (+ WebGL globe) is heavy and only needed on this tab — lazy-load it so it
// stays out of the main bundle and only fetches when the Map sub-tab is opened.
const Globe = lazy(() => import('./Globe/Globe'));

export const WorldCupMap = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { eventId, countries, updatedAt, isLoading, isError } = useWorldCupWinner();

  const [query, setQuery] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => c.name.toLowerCase().includes(q));
  }, [countries, query]);

  const handleSelect = (country: WorldCupCountry) => {
    if (!eventId) return;
    const path = buildPath(ROUTES.USER.EVENT_DETAIL, { id: eventId });
    navigate(`${path}?market=${encodeURIComponent(country.marketId)}`);
  };

  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  if (isLoading) {
    return (
      <div className="wc-map__state">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || countries.length === 0) {
    return (
      <div className="wc-map__state">
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {isError ? t('worldCup.map.loadError') : t('worldCup.map.empty')}
        </p>
      </div>
    );
  }

  return (
    <section className="wc-map" aria-label={t('worldCup.map.title')}>
      <header className="wc-map__header">
        <div className="min-w-0">
          <h2 className="wc-map__title">{t('worldCup.map.title')}</h2>
          {updatedLabel && (
            <p className="wc-map__updated">{t('worldCup.map.updated', { date: updatedLabel })}</p>
          )}
        </div>
        <label className="wc-map__search">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('worldCup.map.searchPlaceholder')}
            aria-label={t('worldCup.map.searchPlaceholder')}
          />
        </label>
      </header>

      <div className="wc-map__body">
        <div className="wc-map__globe">
          <Suspense
            fallback={
              <div className="wc-map__state">
                <Spinner size="lg" />
              </div>
            }
          >
            <Globe countries={countries} onSelect={handleSelect} highlightedId={highlightedId} />
          </Suspense>
        </div>

        <div className="wc-map__list-wrap">
          {filtered.length === 0 ? (
            <p
              className="wc-map__no-results text-sm"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t('worldCup.map.noResults')}
            </p>
          ) : (
            <CountryList
              countries={filtered}
              onSelect={handleSelect}
              highlightedId={highlightedId}
              onHighlight={setHighlightedId}
            />
          )}
        </div>
      </div>
    </section>
  );
};
