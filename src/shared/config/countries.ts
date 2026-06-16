// Country geo dataset for the World Cup map. Maps a country display name to a
// flag-icons code (ISO 3166-1 alpha-2, lowercase — England/Wales/Scotland use
// the GB subdivision subcodes flag-icons ships as regional flags) and an
// approximate centroid (lat/lng in degrees) used to place flag markers on the
// dotted globe. The list is a superset of likely 2026 FIFA World Cup nations so
// the "World Cup Winner" sub-markets resolve to a flag + globe position.
//
// Names are matched case/diacritic-insensitively; `aliases` cover the spelling
// variants Polymarket uses (e.g. "USA" vs "United States", "Ivory Coast" vs
// "Côte d'Ivoire"). Unmatched markets still appear in the country list — they
// just render without a flag or globe marker.

export interface CountryGeo {
  /** Canonical display name. */
  name: string;
  /** flag-icons code (lowercase ISO 3166-1 alpha-2 or GB subdivision subcode). */
  iso2: string;
  /** Centroid latitude in degrees. */
  lat: number;
  /** Centroid longitude in degrees. */
  lng: number;
  /** Lowercase spelling variants Polymarket may use for this country. */
  aliases?: readonly string[];
}

export const COUNTRY_GEO: readonly CountryGeo[] = [
  { name: 'Argentina', iso2: 'ar', lat: -34.0, lng: -64.0 },
  { name: 'Australia', iso2: 'au', lat: -25.0, lng: 133.0 },
  { name: 'Austria', iso2: 'at', lat: 47.5, lng: 14.5 },
  { name: 'Belgium', iso2: 'be', lat: 50.6, lng: 4.7 },
  { name: 'Brazil', iso2: 'br', lat: -10.0, lng: -55.0 },
  { name: 'Cameroon', iso2: 'cm', lat: 5.7, lng: 12.4 },
  { name: 'Canada', iso2: 'ca', lat: 56.0, lng: -106.0 },
  { name: 'Chile', iso2: 'cl', lat: -33.0, lng: -71.0 },
  { name: 'Colombia', iso2: 'co', lat: 4.0, lng: -73.0 },
  { name: 'Croatia', iso2: 'hr', lat: 45.1, lng: 15.2 },
  { name: 'Denmark', iso2: 'dk', lat: 56.0, lng: 10.0 },
  { name: 'Ecuador', iso2: 'ec', lat: -1.5, lng: -78.0 },
  { name: 'Egypt', iso2: 'eg', lat: 26.0, lng: 30.0 },
  { name: 'England', iso2: 'gb-eng', lat: 52.5, lng: -1.5 },
  { name: 'France', iso2: 'fr', lat: 46.0, lng: 2.0 },
  { name: 'Germany', iso2: 'de', lat: 51.0, lng: 10.4 },
  { name: 'Ghana', iso2: 'gh', lat: 7.9, lng: -1.0 },
  { name: 'Iran', iso2: 'ir', lat: 32.0, lng: 53.0 },
  { name: 'Italy', iso2: 'it', lat: 42.8, lng: 12.8 },
  {
    name: "Côte d'Ivoire",
    iso2: 'ci',
    lat: 7.5,
    lng: -5.5,
    aliases: ['ivory coast', 'cote d ivoire', 'cote divoire'],
  },
  { name: 'Japan', iso2: 'jp', lat: 36.2, lng: 138.2 },
  { name: 'Jordan', iso2: 'jo', lat: 31.2, lng: 36.5 },
  { name: 'Mexico', iso2: 'mx', lat: 23.6, lng: -102.5 },
  { name: 'Morocco', iso2: 'ma', lat: 31.8, lng: -7.1 },
  { name: 'Netherlands', iso2: 'nl', lat: 52.1, lng: 5.3, aliases: ['holland'] },
  { name: 'New Zealand', iso2: 'nz', lat: -42.0, lng: 174.0 },
  { name: 'Nigeria', iso2: 'ng', lat: 9.1, lng: 8.7 },
  { name: 'Norway', iso2: 'no', lat: 60.5, lng: 8.5 },
  { name: 'Panama', iso2: 'pa', lat: 8.5, lng: -80.0 },
  { name: 'Paraguay', iso2: 'py', lat: -23.4, lng: -58.4 },
  { name: 'Peru', iso2: 'pe', lat: -9.2, lng: -75.0 },
  { name: 'Poland', iso2: 'pl', lat: 52.0, lng: 19.0 },
  { name: 'Portugal', iso2: 'pt', lat: 39.4, lng: -8.2 },
  { name: 'Qatar', iso2: 'qa', lat: 25.3, lng: 51.2 },
  {
    name: 'Saudi Arabia',
    iso2: 'sa',
    lat: 24.0,
    lng: 45.0,
    aliases: ['ksa'],
  },
  { name: 'Scotland', iso2: 'gb-sct', lat: 56.5, lng: -4.2 },
  { name: 'Senegal', iso2: 'sn', lat: 14.5, lng: -14.5 },
  { name: 'Serbia', iso2: 'rs', lat: 44.0, lng: 21.0 },
  {
    name: 'South Korea',
    iso2: 'kr',
    lat: 36.5,
    lng: 127.8,
    aliases: ['korea', 'korea republic', 'republic of korea', 'south-korea'],
  },
  { name: 'South Africa', iso2: 'za', lat: -30.0, lng: 25.0 },
  { name: 'Spain', iso2: 'es', lat: 40.0, lng: -3.7 },
  { name: 'Sweden', iso2: 'se', lat: 62.0, lng: 15.0 },
  { name: 'Switzerland', iso2: 'ch', lat: 46.8, lng: 8.2 },
  { name: 'Tunisia', iso2: 'tn', lat: 34.0, lng: 9.0 },
  { name: 'Algeria', iso2: 'dz', lat: 28.0, lng: 3.0 },
  { name: 'Turkey', iso2: 'tr', lat: 39.0, lng: 35.0, aliases: ['turkiye', 'türkiye'] },
  { name: 'Ukraine', iso2: 'ua', lat: 49.0, lng: 32.0 },
  { name: 'Uruguay', iso2: 'uy', lat: -32.5, lng: -55.8 },
  {
    name: 'USA',
    iso2: 'us',
    lat: 39.8,
    lng: -98.6,
    aliases: ['united states', 'united states of america', 'u s a', 'us', 'usmnt'],
  },
  { name: 'Uzbekistan', iso2: 'uz', lat: 41.4, lng: 64.6 },
  { name: 'Wales', iso2: 'gb-wls', lat: 52.3, lng: -3.7 },
];

/**
 * Normalise a country name for matching: lowercase, strip diacritics, collapse
 * punctuation/whitespace. "Côte d'Ivoire" → "cote d ivoire".
 */
function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Precomputed lookup: every canonical name + alias → CountryGeo.
const GEO_BY_KEY: ReadonlyMap<string, CountryGeo> = (() => {
  const map = new Map<string, CountryGeo>();
  for (const country of COUNTRY_GEO) {
    map.set(normalizeName(country.name), country);
    for (const alias of country.aliases ?? []) {
      map.set(normalizeName(alias), country);
    }
  }
  return map;
})();

/**
 * Resolve a country display name (a market's group_label or parsed question) to
 * its flag + centroid. Returns null when the name is not a known country.
 */
export function lookupCountry(name: string | null | undefined): CountryGeo | null {
  if (!name) return null;
  return GEO_BY_KEY.get(normalizeName(name)) ?? null;
}
