export const MOODS = [
  { id: 'kort' }, { id: 'topper' }, { id: 'parel' }, { id: 'klassieker' }, { id: 'vers' },
];

export function moodTest(moodId, film, m) {
  const ns = nossyScore(m); // gemiddelde van IMDb/RT/Meta/TMDB waar beschikbaar
  switch (moodId) {
    case 'kort': return !!(m && m.runtime && m.runtime <= 105);
    case 'topper': return !!(ns && ns >= 7.4);
    case 'parel': return !!(ns && ns >= 7.0 && m.votes > 50 && m.votes < 20000);
    case 'klassieker': return !!(film.year && film.year < 1990);
    case 'vers': return !!(film.year && film.year >= 2020);
    default: return true;
  }
}

export function applyFilters(films, metaByKey, filters, seenSet) {
  return films.filter((f) => {
    const m = metaByKey[f.key];
    if (filters.excludeSeen && seenSet.has(f.key)) return false;
    if (filters.minYear && (!f.year || f.year < filters.minYear)) return false;
    if (filters.maxYear && (!f.year || f.year > filters.maxYear)) return false;
    if (filters.maxRuntime) {
      if (!m || !m.runtime || m.runtime > filters.maxRuntime) return false;
    }
    if (filters.minVote) {
      const ns = nossyScore(m);
      if (!ns || ns < filters.minVote) return false;
    }
    if (filters.genres.length) {
      if (!m || !m.genres || !filters.genres.some((g) => m.genres.includes(g))) return false;
    }
    if (filters.providers.length) {
      if (!m || !m.flat || !filters.providers.some((p) => m.flat.includes(p))) return false;
    }
    if (filters.mood && !moodTest(filters.mood, f, m)) return false;
    return true;
  });
}

// Gewogen random: hogere score = meer kans, recent gepickt = flinke penalty
export function pickWinner(pool, metaByKey, smart, history) {
  if (!pool.length) return null;
  if (!smart) return pool[Math.floor(Math.random() * pool.length)];
  const recent = new Set(history.slice(0, 20).map((h) => h.key));
  const weights = pool.map((f) => {
    const m = metaByKey[f.key];
    const vote = nossyScore(m) ?? 6; // slimme pick weegt op de Nossy-score
    let w = Math.pow(Math.max(vote, 1), 2);
    if (recent.has(f.key)) w *= 0.3;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let t = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    t -= weights[i];
    if (t <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// Voorkeur: TMDB-aanbevelingen van de winnaar die óók in je pool zitten.
// Fallback: genre-overlap of dezelfde regisseur.
export function similarPool(winner, pool, metaByKey) {
  const wm = metaByKey[winner.key];
  const candidates = pool.filter((f) => f.key !== winner.key);
  if (!wm) return candidates;

  const recIds = new Set((wm.recs || []).map((r) => r.id));
  const byRec = candidates.filter((f) => {
    const m = metaByKey[f.key];
    return m && recIds.has(m.id);
  });
  if (byRec.length) return byRec;

  const genres = wm.genres || [];
  const byMatch = candidates.filter((f) => {
    const m = metaByKey[f.key];
    if (!m) return false;
    if (wm.director && m.director === wm.director) return true;
    const overlap = genres.filter((g) => (m.genres || []).includes(g)).length;
    return overlap >= Math.min(2, Math.max(genres.length, 1));
  });
  if (byMatch.length) return byMatch;

  return candidates.filter((f) => {
    const m = metaByKey[f.key];
    return m && genres.some((g) => (m.genres || []).includes(g));
  });
}

export function sample(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// Nossy-score: gewogen gemiddelde van de cijfer-bronnen op een schaal van 10.
// Standaard tellen IMDb, Metacritic en TMDB gelijk — de eerdere dubbele
// IMDb-weging was vooral tegenwicht tegen RT-inflatie, en dat argument
// verviel toen RT eruit ging. Het recept is instelbaar (Setup): het is
// tenslotte de Nóssy-score. Rotten Tomatoes telt bewust nooit mee: de
// Tomatometer is een consensus-percentage, geen cijfer.
export const DEFAULT_NOSSY_WEIGHTS = { imdb: 1, mc: 1, tmdb: 1 };
let NOSSY_WEIGHTS = { ...DEFAULT_NOSSY_WEIGHTS };
export const setNossyWeights = (w) => { NOSSY_WEIGHTS = { ...DEFAULT_NOSSY_WEIGHTS, ...(w || {}) }; };
export const getNossyWeights = () => NOSSY_WEIGHTS;

export function nossyScore(m) {
  if (!m) return null;
  const parts = []; // [waarde, gewicht]
  if (m.ext?.imdb && NOSSY_WEIGHTS.imdb > 0) parts.push([m.ext.imdb, NOSSY_WEIGHTS.imdb]);
  if (m.ext?.mc && NOSSY_WEIGHTS.mc > 0) parts.push([m.ext.mc / 10, NOSSY_WEIGHTS.mc]);
  if (m.vote && NOSSY_WEIGHTS.tmdb > 0) parts.push([m.vote, NOSSY_WEIGHTS.tmdb]);
  if (!parts.length) return null;
  const som = parts.reduce((a, [v, w]) => a + v * w, 0);
  const gewicht = parts.reduce((a, [, w]) => a + w, 0);
  // Number.EPSILON voorkomt dat 8.15 als 8.1499… net verkeerd afrondt
  return Math.round((som / gewicht + Number.EPSILON) * 10) / 10;
}

// Altijd één decimaal: "8,0" i.p.v. een kaal "8" naast "IMDb 7,9"
export const fmtScore = (n) => (Math.round(Number(n) * 10) / 10).toFixed(1).replace('.', ',');
