import { useMemo } from 'react';
import { useEventById } from './useEventById';
import { useWorldCupWinnerEventId } from './useWorldCupWinnerEventId';
import { marketsToWorldCupCountries, type WorldCupCountry } from './worldCupCountries';

export interface WorldCupWinnerData {
  /** Resolved event id (system_settings override or fallback), undefined while loading. */
  eventId: string | undefined;
  /** Country rows sorted by win probability DESC. */
  countries: WorldCupCountry[];
  /** Latest outcome price update across the event, for an "Updated …" label. */
  updatedAt: string | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * Loads the "World Cup Winner" event and projects its per-country sub-markets
 * into the rows the map renders (globe markers + ranked list). Powers both the
 * globe and the country list from a single source of truth.
 */
export function useWorldCupWinner(): WorldCupWinnerData {
  const { data: eventId, isLoading: isIdLoading } = useWorldCupWinnerEventId();
  const { data, isLoading: isEventLoading, isError, error } = useEventById(eventId);

  const countries = useMemo(() => (data ? marketsToWorldCupCountries(data.markets) : []), [data]);

  const updatedAt = useMemo(() => {
    if (!data) return null;
    let latest: string | null = null;
    for (const market of data.markets) {
      for (const outcome of market.market_outcomes) {
        if (outcome.updated_at && (latest === null || outcome.updated_at > latest)) {
          latest = outcome.updated_at;
        }
      }
    }
    return latest;
  }, [data]);

  return {
    eventId,
    countries,
    updatedAt,
    isLoading: isIdLoading || isEventLoading,
    isError,
    error: error ?? null,
  };
}
