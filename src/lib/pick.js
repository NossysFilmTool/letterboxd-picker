import { beoordeelCijfer } from './opgeblazen.js';
import { mcOpTien } from './metacritic.js';
import { decimaal } from './i18n.js';

export const MOODS = [
  { id: 'kort' }, { id: 'topper' }, { id: 'parel' }, { id: 'klassieker' }, { id: 'vers' },
];

export function moodTest(moodId, film, m) {
  const ns = appScore(m); // gemiddelde van IMDb, Metacritic en TMDB waar beschikbaar
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
      const ns = appScore(m);
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
export function pickWinner(pool, metaByKey, smart, history, rnd = Math.random) {
  if (!pool.length) return null;
  if (!smart) return pool[Math.floor(rnd() * pool.length)];
  const recent = new Set(history.slice(0, 20).map((h) => h.key));
  const weights = pool.map((f) => {
    const m = metaByKey[f.key];
    const vote = appScore(m) ?? 6; // slimme pick weegt op de app-score
    let w = Math.pow(Math.max(vote, 1), 2);
    if (recent.has(f.key)) w *= 0.3;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let t = rnd() * total;
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

// De app-score (in beeld: lib/merk.js SCORE): het gemiddelde van IMDb,
// Metacritic en TMDB, op een schaal van 10. Voor iedereen hetzelfde: het
// instelbare recept van voor versie 6.1 is weg, want gasten in de zaal zagen
// de score volgens het recept van de gastheer.
// - Metacritic gaat eerst naar dezelfde schaal (lib/metacritic.js); gewoon
//   delen door tien trok een film met critici-cijfer omlaag.
// - Rotten Tomatoes telt bewust nooit mee: de Tomatometer is een
//   consensus-percentage, geen cijfer.
// - Een opgeblazen TMDB-cijfer (fans of bots, door IMDb niet bevestigd) telt
//   niet mee: Gabriel's Inferno III kreeg anders een 7,4 uit IMDb 6,5 en TMDB 8,3.
const tmdbTelt = (m) => !!m.vote && !beoordeelCijfer(m).opgeblazen;

export function appScore(m) {
  if (!m) return null;
  const delen = [];
  if (m.ext?.imdb) delen.push(m.ext.imdb);
  if (m.ext?.mc) delen.push(mcOpTien(m.ext.mc));
  if (tmdbTelt(m)) delen.push(m.vote);
  if (!delen.length) return null;
  // Number.EPSILON voorkomt dat 8.15 als 8.1499… net verkeerd afrondt
  return Math.round((delen.reduce((a, v) => a + v, 0) / delen.length + Number.EPSILON) * 10) / 10;
}

// Hoeveel cijferbronnen een film heeft. Pas vanaf twee heet het gemiddelde
// de ShutterScore; met alleen TMDB staat er gewoon TMDB.
export const aantalBronnen = (m) => (m ? [m.ext?.imdb, m.ext?.mc, m.vote].filter((v) => v != null).length : 0);

// Voorlopig: er zitten bij elkaar minder dan duizend stemmen achter de score
// (IMDb plus TMDB, als TMDB meetelt). Het cijfer zelf blijft staan, zodat
// kleine films niet zakken; er staat alleen bij dat het nog kan schuiven.
// Metacritic telt hier niet: OMDb geeft niet door hoeveel critici het waren.
// Scores van voor versie 6.1 hebben geen aantal IMDb-stemmen; die krijgen het
// voordeel van de twijfel tot ze opnieuw zijn opgehaald (extTeHalen).
export const VOORLOPIG = { stemmen: 1000 };
export function scoreVoorlopig(m) {
  if (!m || appScore(m) == null) return false;
  const imdb = m.ext?.imdb != null;
  if (imdb && m.ext.imdbVotes == null) return false;
  const stemmen = (imdb ? m.ext.imdbVotes : 0) + (tmdbTelt(m) ? m.votes ?? 0 : 0);
  return stemmen < VOORLOPIG.stemmen;
}

// Moet OMDb (opnieuw) gevraagd worden? Ja als er nog niets is. En eenmalig
// voor scores van voor versie 6.1 zonder aantal IMDb-stemmen, maar alleen
// waar het ertoe doet: films met minder dan duizend TMDB-stemmen. Zo kost
// het weinig van je daglimiet.
export function extTeHalen(m) {
  if (!m) return false;
  if (!m.ext) return true;
  return m.ext.imdb != null && !('imdbVotes' in m.ext) && (m.votes ?? 0) < VOORLOPIG.stemmen;
}

// Altijd één decimaal: "8,0" i.p.v. een kaal "8" naast "IMDb 7,9"
export const fmtScore = (n) => decimaal((Math.round(Number(n) * 10) / 10).toFixed(1));
