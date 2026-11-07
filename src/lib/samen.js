// "Voor ons": samen een film kiezen op ieders smaak, niet alleen op watchlist.
//
// De gastheer zet een avond klaar met kandidaten uit zijn watchlist. Elke gast
// opent de link op de eigen telefoon en laadt daar de eigen Letterboxd-export.
// Die blijft op dat toestel: het toestel leest de smaak (de beoordeelde films
// via TMDB) en rekent per kandidaat een score uit met dezelfde matchScore als
// Voor jou. Alleen die scores gaan naar de sessie. De gastheer ziet zo per
// film hoe goed hij bij ieder past, en kiest.
import { buildTaste, matchScore } from './taste.js';

// Wat er per kandidaat mee de sessie in gaat: genoeg om op een ander toestel
// te scoren, niet meer.
export function kandidaatVoorSessie(film, m = {}) {
  return {
    key: film.key,
    name: film.name,
    year: film.year || null,
    poster: m.poster || null,
    id: m.id || null,
    genres: (m.genres || []).slice(0, 6),
    keywords: (m.keywords || []).slice(0, 15).map((k) => k.id),
    vote: m.vote ?? null,
    votes: m.votes ?? null,
    runtime: m.runtime || null,
    lang: m.lang || null,
  };
}

// De kandidaten: films met filmdata eerst (die zijn te scoren), willekeurig
// gemengd, hooguit 60.
export function kiesKandidaten(pool, meta, max = 60) {
  const gemengd = [...pool].sort(() => Math.random() - 0.5);
  const metData = gemengd.filter((f) => meta[f.key]?.genres?.length);
  const zonder = gemengd.filter((f) => !meta[f.key]?.genres?.length);
  return [...metData, ...zonder].slice(0, max).map((f) => kandidaatVoorSessie(f, meta[f.key]));
}

// De beoordelingen die het meest over je smaak zeggen (de uitschieters naar
// boven en beneden), hooguit `max`: zo blijft het ophalen op een telefoon kort.
export function informatieveRatings(ratedFilms, max = 120) {
  return [...ratedFilms]
    .map((f, i) => ({ f, i }))
    .sort((a, b) => Math.abs(b.f.rating - 3) - Math.abs(a.f.rating - 3) || a.i - b.i)
    .slice(0, max)
    .map(({ f }) => f);
}

// De sessiekandidaat in de vorm die matchScore verwacht
const alsKandidaat = (k) => ({
  vote: k.vote, votes: k.votes, year: k.year, lang: k.lang || undefined,
  genres: k.genres || [], keywords: (k.keywords || []).map((id) => ({ id })),
});

const OP_LIJST_BONUS = 12;

// Scores voor één persoon. smaak: een buildTaste-profiel. gezien/opLijst:
// sets met keys (Letterboxd-naam+jaar) en TMDB-ids van die persoon.
//   uit: { key: { s: 0-100 | null, w: op watchlist, g: al gezien } }
export function scoorKandidaten(kandidaten, smaak, { gezienKeys = new Set(), gezienIds = new Set(), lijstKeys = new Set(), lijstIds = new Set() } = {}) {
  const uit = {};
  kandidaten.forEach((k) => {
    const g = gezienKeys.has(k.key) || (k.id != null && gezienIds.has(k.id));
    const w = lijstKeys.has(k.key) || (k.id != null && lijstIds.has(k.id));
    let s = Math.round(matchScore(alsKandidaat(k), smaak).score);
    if (w) s = Math.min(99, s + OP_LIJST_BONUS);
    uit[k.key] = { s, w, g };
  });
  return uit;
}

// De hele gast-kant, behalve het ophalen: van export + opgehaalde filmdata
// naar scores. export: uitkomst van parseLetterboxdFiles; meta: { key: detail }
export function scoresUitExport(kandidaten, exp, meta) {
  const ratedFilms = exp.ratings?.films || [];
  const watchlist = exp.watchlist || [];
  const watched = exp.watched || [];
  const smaak = buildTaste({ watchlist: watchlist.filter((f) => meta[f.key]), ratedFilms, meta });
  const idsVan = (lijst) => new Set(lijst.map((f) => meta[f.key]?.id).filter(Boolean));
  return scoorKandidaten(kandidaten, smaak, {
    gezienKeys: new Set([...watched, ...ratedFilms].map((f) => f.key)),
    gezienIds: idsVan([...watched, ...ratedFilms]),
    lijstKeys: new Set(watchlist.map((f) => f.key)),
    lijstIds: idsVan(watchlist),
  });
}

// Zonder export: de gast tikt aan wat hij wel ziet zitten
export function scoresUitKeuze(kandidaten, gekozen) {
  const set = new Set(gekozen);
  return Object.fromEntries(kandidaten.map((k) => [k.key, { s: set.has(k.key) ? 80 : 40, w: false, g: false }]));
}

export const ONDERGRENS = 45;

// De ranglijst voor de groep. Eerst films die niemand zag en waar niemand
// onder de ondergrens zit, op het gemiddelde; daarna de rest. Zo wint niet de
// film die twee mensen geweldig en één persoon vreselijk vinden.
//   scores: { naam: { key: { s, w, g } } }
export function groepsRanglijst(films, scores, { ondergrens = ONDERGRENS } = {}) {
  const namen = Object.keys(scores);
  return films.map((film) => {
    const per = {};
    namen.forEach((n) => { if (scores[n]?.[film.key]) per[n] = scores[n][film.key]; });
    const waarden = Object.values(per).map((x) => x.s).filter((s) => s != null);
    const gemiddeld = waarden.length ? Math.round(waarden.reduce((a, b) => a + b, 0) / waarden.length) : null;
    const laagste = waarden.length ? Math.min(...waarden) : null;
    const gezienDoor = Object.entries(per).filter(([, x]) => x.g).map(([n]) => n);
    const opLijstVan = Object.entries(per).filter(([, x]) => x.w).map(([n]) => n);
    return { film, per, gemiddeld, laagste, gezienDoor, opLijstVan, ellende: laagste != null && laagste < ondergrens };
  }).sort((a, b) => {
    const rang = (r) => (r.gezienDoor.length ? 2 : 0) + (r.ellende ? 1 : 0);
    return rang(a) - rang(b) || (b.gemiddeld ?? -1) - (a.gemiddeld ?? -1) || (b.laagste ?? -1) - (a.laagste ?? -1);
  });
}
