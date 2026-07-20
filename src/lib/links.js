// Externe links voor filmkaarten, met fallbacks die altijd werken:
// een directe link als de data er is, anders de juiste zoekpagina.
import { getRegion } from './tmdb.js';

export const lbLink = (film, tmdbId) => film?.uri
  || (tmdbId ? `https://letterboxd.com/tmdb/${tmdbId}` : `https://letterboxd.com/search/${encodeURIComponent(film?.name || '')}/`);

export const imdbLink = (meta, film) => (meta?.imdbId
  ? `https://www.imdb.com/title/${meta.imdbId}/`
  : `https://www.imdb.com/find/?q=${encodeURIComponent(`${film?.name || ''}${film?.year ? ` ${film.year}` : ''}`)}`);

export const jwLink = (meta, film) => meta?.jwLink
  || `https://www.justwatch.com/${getRegion().toLowerCase()}/search?q=${encodeURIComponent(film?.name || '')}`;
