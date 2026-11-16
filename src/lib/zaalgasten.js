// De zaal kent de gasten (zaalstemming). Wie wil, laat de eigen Letterboxd
// meetellen. De telefoon leest daaruit wat je al zag, wat er op je
// watchlist staat en je smaak, en geeft per film die op tafel kan komen
// alleen terug: gezien of niet, op je watchlist of niet, en hoe goed hij bij
// je past (0 tot 100). Je export en je beoordelingen verlaten de telefoon
// niet. Het scherm slaat daarmee films over die iemand al zag, en weegt de
// smaak van de zaal mee (lib/zaalstemming.js kiesFilms, lib/aanraders.js).
//
// Het verloop: een gast kiest op de telefoon "ja, met mijn Letterboxd" (de
// gegevens van de tool op die telefoon, een onthouden export, of een nieuwe
// export). De telefoon meldt zich dan (/smaak met v 0). Het scherm zet de
// films die op tafel kunnen komen klaar (/vraag, een nieuwe versie v), de
// telefoon ziet de nieuwe versie, haalt de films op, rekent en stuurt de
// oordelen terug. De vraag groeit (eerst de pot, dan wat er na de
// genrestemming nog ontbrak, dan de aanraders), zodat wie later aanhaakt
// alles in één keer krijgt. Vlak voor het kiezen leest het scherm de oordelen.
import { buildTaste } from './taste.js';
import { kandidaatVoorSessie, scoorKandidaten, informatieveRatings, ONDERGRENS } from './samen.js';
import { maakHerkenner } from './gezien.js';
import { leesOpslag } from './storage.js';
import { nossyScore } from './pick.js';

// Het onthouden profiel op een gast-telefoon: { profiel }
export const MIJN_LETTERBOXD = 'zaalMijnLetterboxd';
// Hooguit zoveel films van de lijst gaan ter beoordeling naar de telefoons
export const MAX_VRAAG = 200;
// Waar je op letterboxd.com je export maakt
export const LETTERBOXD_EXPORT = 'https://letterboxd.com/settings/data/';

const uniek = (lijst) => [...new Set(lijst.filter(Boolean))];

// Het profiel waarmee een telefoon oordeelt: smaak, wat je zag en wat je wilt
// zien. Klein genoeg om te onthouden (alleen sleutels en het smaakprofiel).
//   watched, ratedFilms, watchlist: [{ key }]; extraGezien: losse sleutels
//   meta: filmdata per sleutel (voor de smaak); bron: 'export' of 'app'
export function maakProfiel({ watchlist = [], watched = [], ratedFilms = [], extraGezien = [], meta = {}, bron = 'export', nu = Date.now() }) {
  const gezien = uniek([...watched.map((f) => f.key), ...ratedFilms.map((f) => f.key), ...extraGezien]);
  const lijst = uniek(watchlist.map((f) => f.key));
  const smaak = buildTaste({ watchlist: watchlist.filter((f) => meta[f.key]), ratedFilms, meta });
  return { v: 1, bron, at: nu, gezien, lijst, beoordeeld: ratedFilms.length, smaak };
}

// Wat de tool zelf al weet op deze telefoon (wie de tool ook gebruikt):
// geen export nodig. Null als er niets is, of alleen de demo.
//   metaLezen: leest alle filmdata (IndexedDB, of localStorage als vangnet)
export async function profielUitApp({ lees = leesOpslag, metaLezen } = {}) {
  if (lees('demoMode', false)) return null;
  const watchlist = lees('watchlist', []) || [];
  const ratedFilms = lees('ratedFilms', []) || [];
  const ratings = lees('ratings', {}) || {};
  const extraGezien = [
    ...(lees('watchedLb', []) || []), ...(lees('watchedFilms', []) || []).map((f) => f?.key),
    ...(lees('seen', []) || []), ...Object.keys(ratings),
  ];
  if (!watchlist.length && !ratedFilms.length && !extraGezien.length) return null;
  let meta = {};
  try { meta = (await metaLezen?.()) || lees('meta', {}) || {}; } catch { meta = lees('meta', {}) || {}; }
  // Je eigen sterren tellen mee met die uit Letterboxd
  const sterren = new Map(ratedFilms.map((f) => [f.key, f]));
  watchlist.forEach((f) => { if (ratings[f.key] != null && !sterren.has(f.key)) sterren.set(f.key, { ...f, rating: ratings[f.key] }); });
  return maakProfiel({ watchlist, ratedFilms: [...sterren.values()], extraGezien, meta, bron: 'app' });
}

// Welke films de telefoon van TMDB ophaalt om je smaak te lezen uit een
// export: de beoordelingen die het meest zeggen, en bij weinig
// beoordelingen een deel van de watchlist (net als bij Voor ons)
export function ophalenVoorSmaak(exp) {
  const rated = exp?.ratings?.films || [];
  return [...informatieveRatings(rated, 120), ...(rated.length < 15 ? (exp?.watchlist || []).slice(0, 60) : [])];
}

// Een export (parseLetterboxdFiles) plus de opgehaalde filmdata: het profiel
export function profielUitExport(exp, meta) {
  return maakProfiel({
    watchlist: exp?.watchlist || [], watched: exp?.watched || [], ratedFilms: exp?.ratings?.films || [], meta, bron: 'export',
  });
}

// Het oordeel van één telefoon over de films op tafel: { key: [score, gezien, wil zien] }
// Gezien en op de watchlist herkent hij ook bij een net andere titel of een
// jaar verschil (festivaljaar tegenover bioscoopjaar).
//   kandidaten: kandidaatVoorSessie-vorm
export function oordeelVan(kandidaten, profiel) {
  const gezienKeys = new Set(profiel.gezien || []);
  const lijstKeys = new Set(profiel.lijst || []);
  const zag = maakHerkenner(profiel.gezien || []);
  const wil = maakHerkenner(profiel.lijst || []);
  const scores = scoorKandidaten(kandidaten, profiel.smaak, { gezienKeys, lijstKeys });
  return Object.fromEntries(kandidaten.map((k) => {
    const o = scores[k.key] || {};
    const film = { title: k.name, year: k.year };
    const gezien = !!o.g || zag(film);
    // Zonder genres is er niets om de smaak aan af te meten: dan geen score
    const score = gezien || !k.genres?.length ? null : (o.s ?? null);
    return [k.key, [score, gezien ? 1 : 0, o.w || wil(film) ? 1 : 0]];
  }));
}

// De films die ter beoordeling naar de telefoons gaan: de pot, hooguit
// MAX_VRAAG. Films met filmdata eerst (die zijn ook op smaak te scoren),
// dan met een trailer en een hoger cijfer. Zonder filmdata kan een telefoon
// nog wel zien of je hem al zag (op titel en jaar).
export function vraagUitPot(pool, meta, max = MAX_VRAAG) {
  return pool
    .map((f) => ({ f, w: (meta[f.key]?.genres?.length ? 20 : 0) + (meta[f.key]?.trailer ? 10 : 0) + (nossyScore(meta[f.key]) ?? 6) }))
    .sort((a, b) => b.w - a.w)
    .slice(0, max)
    .map(({ f }) => kandidaatVoorSessie(f, meta[f.key]));
}

// Wat de zaal van elke film vindt, uit de oordelen van de telefoons:
// { key: { gezien: [namen], wil: [namen], scores: [..], min, gem } }
//   gasten: { naam: { s: { key: [score, gezien, wil] } } }
export function zaalOordeel(gasten) {
  const per = {};
  Object.entries(gasten || {}).forEach(([naam, g]) => Object.entries(g?.s || {}).forEach(([key, o]) => {
    if (!Array.isArray(o)) return;
    const [s, gezien, wil] = o;
    const x = per[key] || (per[key] = { gezien: [], wil: [], scores: [] });
    if (gezien) x.gezien.push(naam);
    if (wil) x.wil.push(naam);
    if (s != null && !gezien) x.scores.push(s);
  }));
  Object.values(per).forEach((x) => {
    x.min = x.scores.length ? Math.min(...x.scores) : null;
    x.gem = x.scores.length ? Math.round(x.scores.reduce((a, b) => a + b, 0) / x.scores.length) : null;
  });
  return per;
}

// Hoe de slimme pick de zaal meeneemt (kiesFilms):
//   uit: films die iemand al zag (als gezienWeg aanstaat)
//   score, min: de gemiddelde en de laagste score per film (als smaakMee aanstaat)
export function zaalSturing(oordeel, { gezienWeg = true, smaakMee = true } = {}) {
  const uit = new Set();
  const score = {};
  const min = {};
  Object.entries(oordeel || {}).forEach(([key, o]) => {
    if (gezienWeg && o.gezien.length) uit.add(key);
    if (smaakMee && o.gem != null) { score[key] = o.gem; min[key] = o.min; }
  });
  return { uit, score, min };
}

// De pot voor de slimme pick, met de zaal erbij. Wat iemand al zag gaat eruit
// (als er genoeg overblijft). Met de smaak van de zaal: eerst weg wat iemand
// echt niet ziet zitten (onder de ondergrens, zoals bij Voor ons), dan de
// beter passende helft, minstens drie keer zoveel films als er nodig zijn.
// Films zonder oordeel tellen als gemiddeld; de slimme pick kiest daarbinnen.
export function metZaal(basis, zaal, n = 5) {
  if (!zaal) return basis;
  let uit = basis;
  if (zaal.uit?.size) {
    const zonder = uit.filter((f) => !zaal.uit.has(f.key));
    if (zonder.length >= n) uit = zonder;
  }
  const score = zaal.score || {};
  if (Object.keys(score).length && uit.some((f) => score[f.key] != null)) {
    const veilig = uit.filter((f) => !(zaal.min?.[f.key] != null && zaal.min[f.key] < ONDERGRENS));
    if (veilig.length >= n * 2) uit = veilig;
    const s = (f) => score[f.key] ?? 55;
    uit = [...uit].sort((a, b) => s(b) - s(a)).slice(0, Math.max(n * 3, Math.ceil(uit.length / 2)));
  }
  return uit;
}

// Een aanrader met de zaal erbij (lib/aanraders.js): wat iemand al zag zakt
// ver (of valt af, als er genoeg overblijft), de smaak van de zaal telt mee.
//   rij: [{ film, s }]; oordeel: zaalOordeel
export function aanradersMetZaal(rij, oordeel, { gezienWeg = true, smaakMee = true, aantal = 3 } = {}) {
  if (!oordeel || !Object.keys(oordeel).length) return rij;
  const zag = (x) => (oordeel[x.film.key]?.gezien.length || 0) > 0;
  let uit = rij;
  if (gezienWeg) {
    const ongezien = rij.filter((x) => !zag(x));
    if (ongezien.length >= aantal) uit = ongezien;
  }
  return uit.map((x) => {
    const o = oordeel[x.film.key];
    if (!o) return x;
    let s = x.s;
    if (gezienWeg && zag(x)) s -= 3;
    if (smaakMee && o.gem != null) s += (o.gem - 55) / 25 - (o.min < ONDERGRENS ? 0.8 : 0);
    if (o.wil.length) s += 0.4 * Math.min(o.wil.length, 2);
    return { ...x, s };
  });
}
