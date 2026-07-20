const BASE = 'https://api.themoviedb.org/3';
export const IMG = (path, size = 'w342') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

// --- TMDB-toegang via de tool-proxy (Cloudflare Worker) --------------------
// Vul hier de Worker-URL in zodra die live is (bijv.
// 'https://nossy-tmdb.<account>.workers.dev'). Leeg = proxy uit: dan werkt
// alles precies zoals voorheen, met uitsluitend eigen sleutels.
export const PROXY_URL = 'https://nossy-tmdb.songason1-nossytool.workers.dev';
// Interne sentinel: "gebruik de proxy". Gaat als sleutel door de bestaande
// code zodat alle guards (`if (!key)`) ongewijzigd blijven werken.
export const PROXY_KEY = '__nossy_proxy__';
// Effectieve toegang: eigen sleutel wint (override), anders de proxy.
export const effectiveTmdbKey = (ownKey) => ownKey || (PROXY_URL ? PROXY_KEY : '');

async function get(path, key, params = {}) {
  // Alleen echte waarden meesturen: URLSearchParams maakt van undefined/null
  // anders letterlijk de string "undefined", wat TMDB als lege query afwijst.
  const viaProxy = key === PROXY_KEY;
  const clean = viaProxy ? {} : { api_key: key };
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') clean[k] = v;
  }
  const qs = new URLSearchParams(clean).toString();
  const res = await fetch(viaProxy ? `${PROXY_URL}/3${path}${qs ? `?${qs}` : ''}` : `${BASE}${path}?${qs}`);
  if (res.status === 401) throw new Error('KEY_INVALID');
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1200));
    return get(path, key, params);
  }
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

export async function testKey(key) {
  await get('/configuration', key);
  return true;
}

// Eén detail-call per film levert alles: runtime, genres, score, poster,
// backdrop, regisseur, trailer, aanbevelingen én NL streaming-aanbieders.
import { getLang } from './i18n.js';

// Streaming-regio (ISO 3166-1): bepaalt welke aanbieders en JustWatch-link
// TMDB teruggeeft. Instelbaar in Setup; 'NL' als vertrekpunt.
export const DEFAULT_REGION = 'NL';
let REGION = DEFAULT_REGION;
export const setRegion = (r) => { REGION = (typeof r === 'string' && /^[A-Z]{2}$/.test(r)) ? r : DEFAULT_REGION; };
export const getRegion = () => REGION;
// Regio's die TMDB/JustWatch goed dekken — voor de keuzelijst in Setup.
export const REGIONS = ['NL', 'BE', 'GB', 'IE', 'US', 'CA', 'AU', 'NZ', 'DE', 'AT', 'CH', 'FR', 'ES', 'PT', 'IT', 'DK', 'SE', 'NO', 'FI', 'PL', 'JP', 'KR', 'BR', 'MX', 'IN'];

async function fetchDetail(id, key) {
  const d = await get(`/movie/${id}`, key, {
    append_to_response: 'credits,videos,recommendations,watch/providers,keywords',
  });
  const dirCredit = d.credits?.crew?.find((c) => c.job === 'Director');
  const director = dirCredit?.name || null;
  const directorId = dirCredit?.id || null;
  const trailer = d.videos?.results?.find((v) => v.site === 'YouTube' && v.type === 'Trailer')
    || d.videos?.results?.find((v) => v.site === 'YouTube');
  const prov = d['watch/providers']?.results?.[getRegion()] || {};
  const provNames = (arr) => (arr || []).map((p) => p.provider_name);
  return {
    id: d.id,
    imdbId: d.imdb_id || null,
    at: Date.now(),
    title: d.title,
    year: d.release_date ? parseInt(d.release_date.slice(0, 4)) : null,
    runtime: d.runtime || null,
    genres: (d.genres || []).map((g) => g.name),
    keywords: (d.keywords?.keywords || []).slice(0, 10).map((k) => ({ id: k.id, name: k.name })),
    vote: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    votes: d.vote_count || 0,
    poster: d.poster_path,
    backdrop: d.backdrop_path,
    plot: (d.overview || '').length > 500 ? `${(d.overview || '').slice(0, 499).trimEnd()}\u2026` : (d.overview || ''),
    director,
    directorId,
    country: d.production_countries?.[0]?.iso_3166_1 || null,
    trailer: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
    flat: provNames(prov.flatrate),
    rent: provNames([...(prov.rent || []), ...(prov.buy || [])]).slice(0, 4),
    jwLink: prov.link || null,
    recs: (d.recommendations?.results || []).slice(0, 9).map((r) => ({
      id: r.id,
      title: r.title,
      year: r.release_date ? parseInt(r.release_date.slice(0, 4)) : null,
      poster: r.poster_path,
      vote: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
      votes: r.vote_count || 0,
      lang: r.original_language,
      genre_ids: (r.genre_ids || []).slice(0, 4),
    })),
  };
}

// Zoekt de juiste film bij naam + jaar. Belangrijk: TMDB's 'year'-parameter
// matcht op élke release-datum (ook regionale her-uitgaves), dus een remake
// kan een gelijknamige klassieker verdringen. We verifiëren daarom het jaar
// zelf en kiezen bewust de kandidaat die het dichtst bij het gevraagde jaar zit.
export async function resolveFilm(film, key) {
  const want = film.year || null;
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const wantTitle = norm(film.name);

  // primary_release_year is strenger dan 'year' (alleen de hoofd-release)
  const s = await get('/search/movie', key, {
    query: film.name,
    primary_release_year: want || '',
    include_adult: 'false',
  });
  let results = s.results || [];

  // Niets op primair jaar? Dan brede zoek en zelf op jaar filteren/kiezen.
  if (!results.length) {
    const s2 = await get('/search/movie', key, { query: film.name, include_adult: 'false' });
    results = s2.results || [];
  }
  if (!results.length) return null;

  const yearOf = (r) => (r.release_date ? parseInt(r.release_date.slice(0, 4)) : null);

  let hit;
  if (want) {
    // exacte titel + exact jaar is de gouden match
    const exact = results.find((r) => norm(r.title) === wantTitle && yearOf(r) === want);
    // anders: titel-match het dichtst bij het jaar
    const byTitle = results.filter((r) => norm(r.title) === wantTitle);
    const pool = byTitle.length ? byTitle : results;
    hit = exact || pool.slice().sort((a, b) => {
      const da = yearOf(a) == null ? 999 : Math.abs(yearOf(a) - want);
      const db = yearOf(b) == null ? 999 : Math.abs(yearOf(b) - want);
      return da - db;
    })[0];
  } else {
    hit = results.find((r) => norm(r.title) === wantTitle) || results[0];
  }

  if (!hit) return null;
  const meta = await fetchDetail(hit.id, key);
  // markeer twijfelgevallen: jaar wijkt >1 af van wat de watchlist zei
  if (meta && want && meta.year && Math.abs(meta.year - want) > 1) meta.yearMismatch = want;
  return meta;
}

export async function fetchDetailById(id, key) {
  return fetchDetail(id, key);
}

// Lichte her-check van alleen het streamingaanbod in jouw regio (dat wisselt
// wekelijks, de rest van de filmdata niet). Eén kleine call i.p.v. de hele verrijking.
export async function refreshProviders(id, key) {
  const d = await get(`/movie/${id}/watch/providers`, key);
  const prov = d.results?.[getRegion()] || {};
  const provNames = (arr) => (arr || []).map((p) => p.provider_name);
  return {
    flat: provNames(prov.flatrate),
    rent: provNames([...(prov.rent || []), ...(prov.buy || [])]).slice(0, 4),
    jwLink: prov.link || null,
    at: Date.now(),
  };
}

// Officiële TMDB-genre-ids (stabiel), met NL-labels voor de Pareljacht
export const GENRES = [
  { id: 18, en: 'Drama', nl: 'Drama' },
  { id: 35, en: 'Comedy', nl: 'Komedie' },
  { id: 53, en: 'Thriller', nl: 'Thriller' },
  { id: 80, en: 'Crime', nl: 'Misdaad' },
  { id: 27, en: 'Horror', nl: 'Horror' },
  { id: 878, en: 'Science Fiction', nl: 'Sciencefiction' },
  { id: 9648, en: 'Mystery', nl: 'Mystery' },
  { id: 10749, en: 'Romance', nl: 'Romantiek' },
  { id: 28, en: 'Action', nl: 'Actie' },
  { id: 12, en: 'Adventure', nl: 'Avontuur' },
  { id: 16, en: 'Animation', nl: 'Animatie' },
  { id: 99, en: 'Documentary', nl: 'Documentaire' },
  { id: 14, en: 'Fantasy', nl: 'Fantasy' },
  { id: 36, en: 'History', nl: 'Historisch' },
  { id: 10752, en: 'War', nl: 'Oorlog' },
  { id: 10402, en: 'Music', nl: 'Muziek' },
  { id: 10751, en: 'Family', nl: 'Familie' },
  { id: 37, en: 'Western', nl: 'Western' },
];

// Universele zoek door de hele filmdatabase (zelfde lichte vorm als de Pareljacht)
const lightMovie = (r) => ({
  id: r.id,
  title: r.title,
  year: r.release_date ? parseInt(r.release_date.slice(0, 4)) : null,
  poster: r.poster_path,
  vote: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
  votes: r.vote_count || 0,
  lang: r.original_language,
  genre_ids: (r.genre_ids || []).slice(0, 4),
  plot: r.overview || '',
});

export async function searchMovies(key, query) {
  const d = await get('/search/movie', key, { query, include_adult: 'false' });
  return (d.results || []).slice(0, 12).map(lightMovie);
}

// Similar: TMDB's metadata-algoritme (genres/keywords) — belicht een andere
// hoek dan recommendations (kijkgedrag) en is minder mainstream-bevooroordeeld
export async function fetchRecommendations(id, key) {
  const d = await get(`/movie/${id}/recommendations`, key);
  return (d.results || []).slice(0, 20).map(lightMovie);
}

export async function fetchExternalIds(id, key) {
  const d = await get(`/movie/${id}/external_ids`, key);
  return d.imdb_id || null;
}

export async function fetchKeywords(id, key) {
  const d = await get(`/movie/${id}/keywords`, key);
  return (d.keywords || []).map((k) => ({ id: k.id, name: k.name }));
}

export async function fetchSimilar(id, key) {
  const d = await get(`/movie/${id}/similar`, key);
  return (d.results || []).slice(0, 20).map(lightMovie);
}

// Zoeken op maker: regisseurs, acteurs, schrijvers.
// TMDB bevat duplicaat-profielen (bijv. twee 'Wes Anderson'-records):
// we sorteren op populariteit, gooien lege profielen eruit en
// ontdubbelen op naam — het echte profiel wint altijd.
export async function searchPersons(key, query) {
  const d = await get('/search/person', key, { query, include_adult: 'false' });
  const ranked = (d.results || [])
    .filter((p) => (p.popularity || 0) >= 0.5 || (p.known_for || []).length > 0)
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  const seen = new Set();
  const out = [];
  ranked.forEach((p) => {
    const naam = p.name.toLowerCase();
    if (seen.has(naam)) return; // duplicaat-profiel: de populairste wint
    seen.add(naam);
    out.push({ id: p.id, name: p.name, dept: p.known_for_department, profile: p.profile_path });
  });
  return out.slice(0, 3);
}

// Filmografie van een maker: regie-werk eerst (nieuwste bovenaan),
// dan de bekendste acteerrollen
export async function personFilms(key, personId) {
  const d = await get(`/person/${personId}/movie_credits`, key);
  const directed = (d.crew || [])
    .filter((c) => c.job === 'Director')
    .sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''));
  const acted = (d.cast || []).sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0)).slice(0, 40);
  const seen = new Set();
  const out = [];
  [...directed, ...acted].forEach((r) => {
    if (seen.has(r.id) || !r.release_date) return;
    seen.add(r.id);
    out.push({ ...lightMovie(r), rol: directed.includes(r) ? 'regie' : 'cast' });
  });
  return out.slice(0, 60);
}

// Pareljacht: TMDB Discover — goed beoordeelde films met wéinig stemmen.
// De vote_count-band bepaalt hoe diep ondergronds je zoekt.
// De Discover-motor: élk criterium wordt een server-side queryparameter, zodat
// TMDB de hele catalogus doorzoekt i.p.v. dat wij een lokale emmer zeven.
export async function discover(key, { minScore, minVotes, maxVotes, genreIds, excludeGenreIds, yearFrom, yearTo, lang, minRuntime, maxRuntime, sortBy = 'vote_average.desc', page = 1 }) {
  const params = {
    sort_by: sortBy,
    include_adult: 'false',
    page,
  };
  if (minScore) params['vote_average.gte'] = minScore;
  if (minVotes) params['vote_count.gte'] = minVotes;
  if (maxVotes) params['vote_count.lte'] = maxVotes;
  if (genreIds?.length) params.with_genres = genreIds.join(',');
  if (excludeGenreIds?.length) params.without_genres = excludeGenreIds.join(',');
  if (minRuntime) params['with_runtime.gte'] = minRuntime;
  if (maxRuntime) params['with_runtime.lte'] = maxRuntime;
  if (yearFrom) params['primary_release_date.gte'] = `${yearFrom}-01-01`;
  if (yearTo) params['primary_release_date.lte'] = `${yearTo}-12-31`;
  if (lang && lang !== 'alle' && lang !== 'niet-en') params.with_original_language = lang;
  const d = await get('/discover/movie', key, params);
  let results = (d.results || []).map(lightMovie);
  if (lang === 'niet-en') results = results.filter((r) => r.lang !== 'en');
  return {
    results,
    totalPages: Math.min(d.total_pages || 1, 500),
    totalResults: d.total_results || results.length,
  };
}

// Bestaande naam blijft werken (mengmotor, profiel-discover)
export const discoverGems = discover;

// Thema-jacht: haal films op die TMDB-keywords delen met jouw top-thema's.
// with_keywords met | betekent OR (één van de thema's volstaat).
export async function discoverByKeywords(key, keywordIds, { minVotes = 40, page = 1 } = {}) {
  if (!keywordIds?.length) return { results: [], totalPages: 0 };
  const d = await get('/discover/movie', key, {
    with_keywords: keywordIds.slice(0, 5).join('|'),
    'vote_count.gte': minVotes,
    sort_by: 'vote_average.desc',
    include_adult: 'false',
    page,
  });
  return {
    results: (d.results || []).map(lightMovie),
    totalPages: Math.min(d.total_pages || 1, 500),
  };
}

// Verrijkt een lijst films met beperkte parallelliteit; roept onProgress({done,total,errors}) aan
export async function enrichAll(films, key, onProgress, onResult, shouldStop) {
  const total = films.length;
  let done = 0;
  let errors = 0;
  const queue = [...films];
  const worker = async () => {
    while (queue.length) {
      if (shouldStop && shouldStop()) return;
      const film = queue.shift();
      try {
        const meta = await resolveFilm(film, key);
        onResult(film.key, meta); // meta kan null zijn (niet gevonden)
      } catch (e) {
        if (e.message === 'KEY_INVALID') throw e;
        errors++;
      }
      done++;
      onProgress({ done, total, errors });
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return { done, errors };
}

// Genre-label in de actieve UI-taal (GENRES draagt en+nl).
export const genreLabel = (g) => (g ? (getLang() === 'nl' ? g.nl : g.en) : '');
export const genreLabelById = (id) => genreLabel(GENRES.find((g) => g.id === id));
