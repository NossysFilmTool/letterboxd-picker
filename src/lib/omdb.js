// Optionele tweede databron: OMDb voor IMDb-, Rotten Tomatoes- en
// Metacritic-scores. Matcht exact via het IMDb-id uit TMDB.
const BASE = 'https://www.omdbapi.com/';

function parseRatings(d) {
  const out = { at: Date.now() };
  const imdb = parseFloat(d.imdbRating);
  if (!isNaN(imdb)) out.imdb = imdb;
  (d.Ratings || []).forEach((r) => {
    if (r.Source === 'Rotten Tomatoes') {
      const rt = parseInt(r.Value);
      if (!isNaN(rt)) out.rt = rt;
    }
    if (r.Source === 'Metacritic') {
      const mc = parseInt(r.Value);
      if (!isNaN(mc)) out.mc = mc;
    }
  });
  return out;
}

export async function fetchExtRatings(meta, film, key) {
  const params = meta.imdbId
    ? { i: meta.imdbId }
    : { t: film.name, y: film.year || '' };
  const qs = new URLSearchParams({ apikey: key, ...params }).toString();
  const res = await fetch(`${BASE}?${qs}`);
  let d = null;
  try { d = await res.json(); } catch { /* geen json */ }
  if (d && d.Response === 'False') {
    if (/limit reached/i.test(d.Error || '')) throw new Error('LIMIT'); // daglimiet: volgende sleutel
    if (/invalid api key/i.test(d.Error || '')) throw new Error('KEY_INVALID');
    return { at: Date.now() }; // niet gevonden: markeer als geprobeerd
  }
  if (!res.ok || !d) throw new Error(`OMDb ${res.status}`);
  return parseRatings(d);
}

export async function testOmdbKey(key) {
  const res = await fetch(`${BASE}?apikey=${encodeURIComponent(key)}&i=tt0111161`);
  const d = await res.json();
  if (d.Response === 'False') throw new Error('KEY_INVALID');
  return true;
}

// Per-sleutel diagnose: 'ok' | 'limit' (daglimiet op) | 'invalid' | 'netwerk'
export async function checkOmdbKey(key) {
  try {
    const res = await fetch(`${BASE}?apikey=${encodeURIComponent(key)}&i=tt0111161`);
    const d = await res.json();
    if (d.Response === 'False') {
      if (/limit reached/i.test(d.Error || '')) return 'limit';
      return 'invalid';
    }
    return 'ok';
  } catch {
    return 'netwerk';
  }
}
