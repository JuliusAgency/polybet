import { formatProbability } from '@/shared/utils';
import type { WorldCupCountry } from '@/features/bet';

interface CountryListProps {
  countries: WorldCupCountry[];
  onSelect: (country: WorldCupCountry) => void;
  highlightedId?: string | null;
  onHighlight?: (id: string | null) => void;
}

/**
 * Ranked country roster — flag, name, a probability bar scaled to the leader,
 * and a percentage badge. Clicking a row opens the event with that country's
 * sub-market pre-selected. Mirrors the list beside Polymarket's World Cup globe.
 */
export const CountryList = ({
  countries,
  onSelect,
  highlightedId,
  onHighlight,
}: CountryListProps) => {
  const maxProbability = countries.reduce((max, c) => Math.max(max, c.probability ?? 0), 0) || 1;

  return (
    <ul className="wc-map__list" role="list">
      {countries.map((country) => {
        const pct = country.probability;
        const barWidth = pct != null ? Math.max(2, (pct / maxProbability) * 100) : 0;
        const isActive = highlightedId === country.marketId;
        return (
          <li key={country.marketId}>
            <button
              type="button"
              className={`wc-map__row${isActive ? ' wc-map__row--active' : ''}`}
              onClick={() => onSelect(country)}
              onMouseEnter={() => onHighlight?.(country.marketId)}
              onMouseLeave={() => onHighlight?.(null)}
            >
              <span className="wc-map__row-flag" aria-hidden>
                {country.iso2 ? (
                  <span className={`fi fis fi-${country.iso2}`} />
                ) : (
                  <span className="wc-map__marker-dot" />
                )}
              </span>
              <span className="wc-map__row-main">
                <span className="wc-map__row-name">{country.name}</span>
                <span className="wc-map__row-bar" aria-hidden>
                  <span className="wc-map__row-bar-fill" style={{ width: `${barWidth}%` }} />
                </span>
              </span>
              <span className="wc-map__row-pct">{formatProbability(pct)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
