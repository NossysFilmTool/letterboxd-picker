// Venster-logica voor de aanbevelingsrijen: een schuifraam van `stap` films
// over de volledige poel, met nette wrap-around zodat je nooit op een lege
// rij eindigt. Puur en los testbaar.
import { GENRES } from './tmdb.js';

const GENRE_EN = Object.fromEntries(GENRES.map((g) => [g.id, g.en]));

export function vensterVan(films, rawOffset, stap = 12) {
  if (!films.length) return [];
  if (films.length <= stap) return films;
  const off = ((rawOffset % films.length) + films.length) % films.length;
  const uit = films.slice(off, off + stap);
  if (uit.length < stap) uit.push(...films.slice(0, stap - uit.length)); // wrap rond
  return uit;
}

// Voeg nieuwe films toe aan een bestaande lijst zonder duplicaten (op id).
export function voegNieuweToe(bestaand, nieuw) {
  const bekend = new Set(bestaand.map((r) => r.id));
  return [...bestaand, ...nieuw.filter((r) => !bekend.has(r.id))];
}

// TMDB levert aanbevelingen op volgorde van relevantie: plek 1 weegt vol,
// de staart van de lijst half.
export const plekGewicht = (i, n) => 1 - 0.5 * (i / Math.max(n, 1));

// Sorteer een rij op aanbevelingssterkte, met de match als tweede signaal.
// `waarde` is hoe hard de bronnen een film aanraden (meerdere routes, 5★-seeds,
// bovenaan in TMDB's lijst); `match` gaat vooral over genre en kwaliteit. Op
// match alleen sorteren liet zwakke /similar-treffers boven sterke
// aanbevelingen uitkomen. Log-schaal: één film die via vijf routes binnenkomt
// drukt de rest van de rij niet plat.
export function sorteerOpSterkte(films) {
  const max = Math.max(0, ...films.map((f) => f.waarde || 0));
  const norm = max > 0 ? Math.log1p(max) : 1;
  const score = new Map(films.map((f) => [f.id, 0.6 * (Math.log1p(f.waarde || 0) / norm) + 0.4 * ((f.match || 0) / 100)]));
  return [...films].sort((a, b) => score.get(b.id) - score.get(a.id));
}

// Regisseurs achter je favorieten, sterkste eerst: hoe meer films van iemand
// jij hoog gaf, hoe hoger. Alleen wie minstens één 4,5★+-film op zijn naam
// heeft telt mee. Per regisseur bewaren we de genres van jouw films van hem of
// haar, zodat "Meer van X" bij die smaak blijft.
export function rangschikRegisseurs(seeds, meta, max = 12) {
  const per = new Map();
  seeds.forEach((s) => {
    const m = meta[s.key];
    if (!m?.director) return;
    const cur = per.get(m.director) || { naam: m.director, id: null, score: 0, top: 0, genres: new Set() };
    cur.score += (s.rating || 0) - 3;
    cur.top = Math.max(cur.top, s.rating || 0);
    if (!cur.id && m.directorId) cur.id = m.directorId;
    (m.genres || []).forEach((g) => cur.genres.add(g));
    per.set(m.director, cur);
  });
  return [...per.values()]
    .filter((r) => r.top >= 4.5)
    .sort((a, b) => b.score - a.score || b.top - a.top)
    .slice(0, max);
}

// Een oeuvre-film hoort in "Meer van X" als hij een genre deelt met de films
// van X die jij hoog gaf. Zo blijft een uitstapje (Mufasa bij Barry Jenkins)
// buiten de rij. Zonder genre-informatie geven we de film het voordeel van de twijfel.
export function pastInOeuvre(film, genreNamen) {
  if (!genreNamen?.size) return true;
  const ids = film.genre_ids || [];
  if (!ids.length) return true;
  return ids.some((id) => genreNamen.has(GENRE_EN[id]));
}

// Volgorde waarin rijsoorten op het scherm komen. Voorheen stonden alle
// regisseursrijen bovenaan en vulden ze in je tweede sessie álle zichtbare
// plekken. Nu wisselen de soorten elkaar af; wat overblijft wordt reserve
// voor de wissel-knop.
const PATROON = ['seed', 'oeuvre', 'thema', 'seed', 'oeuvre', 'seed', 'profiel'];

// Bouw de rijen-met-reden uit de gescoorde kandidatenlijst. Een film hoort bij
// hooguit één rij (de eerst-claimende bron); elke rij bewaart zijn volledige
// poel, zodat de UI er een venster overheen kan schuiven.
//   list:       [{ id, match, waarde, bronnen, seeds, viaTheme }]
//   regisseurs: namen, sterkste eerst (alleen wie een oeuvre-route heeft telt)
//   seedFilms:  [{ key, name }], sterkste eerst (je 4,5★+-films)
export function bouwRijen(list, { regisseurs = [], seedFilms = [], maxOeuvre = 4, maxSeed = 6 } = {}) {
  const gebruikt = new Set();
  const neem = (films, min = 4) => {
    const vers = films.filter((r) => !gebruikt.has(r.id));
    if (vers.length < min) return null;
    vers.forEach((r) => gebruikt.add(r.id)); // hele poel claimen, niet enkel het venster
    return sorteerOpSterkte(vers);
  };
  const soort = { seed: [], oeuvre: [], thema: [], profiel: [] };

  // 1. Per regisseur: "Meer van {naam}" (hooguit maxOeuvre rijen)
  for (const naam of regisseurs) {
    if (soort.oeuvre.length >= maxOeuvre) break;
    const films = neem(list.filter((r) => r.bronnen.includes(`oeuvre:${naam}`)));
    if (films) soort.oeuvre.push({ id: `oeuvre:${naam}`, type: 'oeuvre', naam, films });
  }
  // 2. Gedeelde thema's
  const themaFilms = list.filter((r) => r.bronnen.includes('thema') || r.viaTheme?.length);
  const themaRij = neem(themaFilms);
  if (themaRij) {
    const themas = [...new Set(themaFilms.flatMap((r) => r.viaTheme || []))].slice(0, 3);
    soort.thema.push({ id: 'thema', type: 'thema', themas, films: themaRij });
  }
  // 3. Omdat je een specifieke film hoog gaf (hooguit maxSeed rijen)
  for (const seed of seedFilms) {
    if (soort.seed.length >= maxSeed) break;
    const films = neem(list.filter((r) => r.seeds.includes(seed.name)));
    if (films) soort.seed.push({ id: `seed:${seed.key}`, type: 'seed', naam: seed.name, films });
  }
  // 4. Profiel-restrij: passende films die nog niet in een rij staan
  const restRij = neem(list.filter((r) => !gebruikt.has(r.id)), 6);
  if (restRij) soort.profiel.push({ id: 'profiel', type: 'profiel', films: restRij });

  const rijen = [];
  PATROON.forEach((t) => { if (soort[t].length) rijen.push(soort[t].shift()); });
  // Reserves: afwisselend een seed- en een regisseursrij
  while (soort.seed.length || soort.oeuvre.length) {
    if (soort.seed.length) rijen.push(soort.seed.shift());
    if (soort.oeuvre.length) rijen.push(soort.oeuvre.shift());
  }
  return rijen;
}
