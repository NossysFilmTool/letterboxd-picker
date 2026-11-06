// Bouwstenen voor de aanbevelingsrijen: wegen, sorteren en regisseurs
// rangschikken. Puur en los testbaar; het rijrecept zelf staat in foryou.js.
import { GENRES } from './tmdb.js';

const GENRE_EN = Object.fromEntries(GENRES.map((g) => [g.id, g.en]));

// Voeg nieuwe films toe aan een bestaande lijst zonder duplicaten (op id).
export function voegNieuweToe(bestaand, nieuw) {
  const bekend = new Set(bestaand.map((r) => r.id));
  return [...bestaand, ...nieuw.filter((r) => !bekend.has(r.id))];
}

// TMDB levert aanbevelingen op volgorde van relevantie: plek 1 weegt vol,
// de staart van de lijst half.
export const plekGewicht = (i, n) => 1 - 0.5 * (i / Math.max(n, 1));

// Sorteer op jouw match, met de aanbevelingssterkte als klein extra signaal.
// `match` is je smaakprofiel (genre, tijdperk, taal, thema's, kwaliteit);
// `waarde` is hoe hard de bronnen een film aanraden. Gemeten met de meetlat
// op een echt profiel (545 beoordelingen): de match zet verborgen favorieten
// veruit het hoogst, de aanbevelingssterkte voorspelt ze slecht (TMDB's
// aanbevelingen zijn populariteitsgekleurd). Vroeger was dit 60/40 andersom;
// 10/90 bracht dat profiel van 2 naar 9 van de 40 in de top 50.
// Log-schaal: één film die via vijf routes binnenkomt drukt de rest niet plat.
// Met een geleerd model (fase 8, zie model.js) draagt elke kandidaat een
// modelScore en rangschikt die; anders de vaste weging hieronder.
export const STERKTE_AANDEEL = 0.1;
export function sorteerOpSterkte(films, aandeel = STERKTE_AANDEEL) {
  if (films.length && films.every((f) => f.modelScore != null)) {
    return [...films].sort((a, b) => b.modelScore - a.modelScore);
  }
  const max = Math.max(0, ...films.map((f) => f.waarde || 0));
  const norm = max > 0 ? Math.log1p(max) : 1;
  const score = new Map(films.map((f) => [f.id, aandeel * (Math.log1p(f.waarde || 0) / norm) + (1 - aandeel) * ((f.match || 0) / 100)]));
  return [...films].sort((a, b) => score.get(b.id) - score.get(a.id));
}

// Regisseurs achter je favorieten, sterkste eerst: hoe meer films van iemand
// jij hoog gaf, hoe hoger. Alleen wie minstens één 4,5★+-film op zijn naam
// heeft telt mee. Per regisseur bewaren we de genres van jouw films van hem of
// haar, zodat "Meer van X" bij die smaak blijft.
export function rangschikRegisseurs(seeds, meta, max = 12, minTop = 4.5) {
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
    .filter((r) => r.top >= minTop)
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
